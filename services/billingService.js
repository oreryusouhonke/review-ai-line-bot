import Stripe from "stripe";
import { getSupabaseClient, isSupabaseConfigured } from "./supabaseClient.js";
import { getOrCreateUser } from "./userService.js";

const FREE_MONTHLY_QUOTA = Number(process.env.FREE_MONTHLY_QUOTA || 0);
const PAID_MONTHLY_QUOTA = Number(process.env.PAID_MONTHLY_QUOTA || 30);

let cachedStripe = null;

export function isStripeBillingConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID);
}

export function getStripeBillingStatus() {
  return {
    configured: isStripeBillingConfigured(),
    webhookConfigured: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    freeMonthlyQuota: FREE_MONTHLY_QUOTA,
    paidMonthlyQuota: PAID_MONTHLY_QUOTA,
  };
}

export async function checkGenerationAccess(lineUserId) {
  if (!lineUserId || !isSupabaseConfigured()) {
    return { allowed: true, reason: "billing_not_enforced" };
  }

  if (!isStripeBillingConfigured()) {
    if (FREE_MONTHLY_QUOTA <= 0) {
      return {
        allowed: false,
        paid: false,
        quota: FREE_MONTHLY_QUOTA,
        used: await getMonthlyGeneratedCount(lineUserId),
        remaining: 0,
        reason: "billing_not_configured",
        paymentUrl: "",
      };
    }
    const monthCount = await getMonthlyGeneratedCount(lineUserId);
    if (monthCount < FREE_MONTHLY_QUOTA) {
      return {
        allowed: true,
        paid: false,
        quota: FREE_MONTHLY_QUOTA,
        used: monthCount,
        remaining: FREE_MONTHLY_QUOTA - monthCount,
        monthKey: currentMonthKey(),
      };
    }
    return {
      allowed: false,
      paid: false,
      quota: FREE_MONTHLY_QUOTA,
      used: monthCount,
      remaining: 0,
      monthKey: currentMonthKey(),
      reason: "free_quota_exceeded",
      paymentUrl: "",
    };
  }

  const user = await getOrCreateUser({ lineUserId });
  const monthKey = currentMonthKey();
  const monthCount = await getMonthlyGeneratedCount(lineUserId);
  const paid = isPaidUser(user);
  const quota = paid ? PAID_MONTHLY_QUOTA : FREE_MONTHLY_QUOTA;

  if (monthCount < quota) {
    return {
      allowed: true,
      paid,
      quota,
      used: monthCount,
      remaining: quota - monthCount,
      monthKey,
    };
  }

  return {
    allowed: false,
    paid,
    quota,
    used: monthCount,
    remaining: 0,
    monthKey,
    paymentUrl: await createCheckoutUrl({ lineUserId }),
  };
}

export async function createCheckoutUrl({ lineUserId }) {
  if (!isStripeBillingConfigured()) return "";

  const stripe = getStripe();
  const baseUrl = publicBaseUrl();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
    client_reference_id: lineUserId,
    metadata: { line_user_id: lineUserId },
    subscription_data: {
      metadata: { line_user_id: lineUserId },
    },
    success_url: process.env.STRIPE_SUCCESS_URL || `${baseUrl}/billing/success`,
    cancel_url: process.env.STRIPE_CANCEL_URL || `${baseUrl}/billing/cancel`,
    allow_promotion_codes: process.env.STRIPE_ALLOW_PROMOTION_CODES === "true",
  });

  return session.url || "";
}

export async function applyCheckoutCompleted(session) {
  const lineUserId = session?.metadata?.line_user_id || session?.client_reference_id;
  if (!lineUserId) return { skipped: true, reason: "missing_line_user_id" };

  await updateUserSubscription(lineUserId, {
    plan: "paid",
    subscription_status: "active",
    stripe_customer_id: stringOrNull(session.customer),
    stripe_subscription_id: stringOrNull(session.subscription),
  });

  return { ok: true, lineUserId };
}

export async function applySubscriptionChanged(subscription) {
  const lineUserId = subscription?.metadata?.line_user_id;
  if (!lineUserId) return { skipped: true, reason: "missing_line_user_id" };

  const active = ["active", "trialing"].includes(subscription.status);
  await updateUserSubscription(lineUserId, {
    plan: active ? "paid" : "free",
    subscription_status: subscription.status,
    stripe_customer_id: stringOrNull(subscription.customer),
    stripe_subscription_id: stringOrNull(subscription.id),
  });

  return { ok: true, lineUserId, status: subscription.status };
}

export async function applySubscriptionDeleted(subscription) {
  const lineUserId = subscription?.metadata?.line_user_id;
  if (!lineUserId) return { skipped: true, reason: "missing_line_user_id" };

  await updateUserSubscription(lineUserId, {
    plan: "free",
    subscription_status: "canceled",
    stripe_customer_id: stringOrNull(subscription.customer),
    stripe_subscription_id: stringOrNull(subscription.id),
  });

  return { ok: true, lineUserId };
}

async function getMonthlyGeneratedCount(lineUserId) {
  const supabase = getSupabaseClient();
  const { monthStart, nextMonthStart } = monthRange();
  const { count, error } = await supabase
    .from("review_histories")
    .select("id", { count: "exact", head: true })
    .eq("line_user_id", lineUserId)
    .eq("type", "create")
    .gte("created_at", monthStart)
    .lt("created_at", nextMonthStart);

  if (error) {
    console.warn("Billing monthly count failed:", safeSupabaseError(error));
    return 0;
  }

  return count || 0;
}

async function updateUserSubscription(lineUserId, fields) {
  if (!lineUserId || !isSupabaseConfigured()) return;
  await getOrCreateUser({ lineUserId });

  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("users")
    .update({
      ...fields,
      updated_at: new Date().toISOString(),
    })
    .eq("line_user_id", lineUserId);

  if (error) throw error;
}

function getStripe() {
  if (cachedStripe) return cachedStripe;
  cachedStripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  return cachedStripe;
}

function isPaidUser(user) {
  return user?.plan === "paid" && ["active", "trialing"].includes(user?.subscription_status);
}

function publicBaseUrl() {
  return (process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || "https://review-ai-line-bot.onrender.com").replace(/\/+$/, "");
}

function currentMonthKey() {
  const now = new Date();
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
  }).format(now);
}

function monthRange() {
  const now = new Date();
  return {
    monthStart: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString(),
    nextMonthStart: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString(),
  };
}

function stringOrNull(value) {
  return typeof value === "string" ? value : null;
}

function safeSupabaseError(error) {
  return {
    message: error?.message,
    code: error?.code,
    details: error?.details,
    hint: error?.hint,
  };
}
