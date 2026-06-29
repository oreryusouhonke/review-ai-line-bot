import { getSupabaseClient, isSupabaseConfigured } from "./supabaseClient.js";
import { getRank } from "./rankService.js";

export async function getOrCreateUser({ lineUserId, displayName = null } = {}) {
  if (!lineUserId) return null;
  if (!isSupabaseConfigured()) {
    return {
      id: null,
      line_user_id: lineUserId,
      display_name: displayName,
      source: "fallback",
    };
  }

  try {
    const supabase = getSupabaseClient();
    const { data: existing, error: findError } = await supabase
      .from("users")
      .select("*")
      .eq("line_user_id", lineUserId)
      .maybeSingle();

    if (findError) throw findError;
    if (existing) return existing;

    const { data: created, error: createError } = await supabase
      .from("users")
      .insert({
        line_user_id: lineUserId,
        display_name: displayName,
      })
      .select("*")
      .single();

    if (createError) throw createError;
    return created;
  } catch (error) {
    console.error("Supabase getOrCreateUser failed:", safeSupabaseError(error));
    return {
      id: null,
      line_user_id: lineUserId,
      display_name: displayName,
      source: "fallback",
      error: true,
    };
  }
}

export const findOrCreateUser = getOrCreateUser;

export async function recordReviewGenerated(lineUserId) {
  if (!lineUserId || !isSupabaseConfigured()) {
    return null;
  }

  try {
    const user = await getOrCreateUser({ lineUserId });
    const reviewCount = await countReviewHistories(lineUserId);
    const rank = getRank(reviewCount).name;
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from("users")
      .update({
        review_count: reviewCount,
        last_review_generated_at: new Date().toISOString(),
        rank,
        updated_at: new Date().toISOString(),
      })
      .eq("line_user_id", lineUserId)
      .select("*")
      .maybeSingle();

    if (error) throw error;
    return data || {
      ...user,
      review_count: reviewCount,
      rank,
    };
  } catch (error) {
    console.error("Supabase recordReviewGenerated failed:", safeSupabaseError(error));
    return null;
  }
}

export async function markMilestoneTagSynced(lineUserId, tagName) {
  if (!lineUserId || !tagName || !isSupabaseConfigured()) {
    return;
  }

  try {
    const user = await getOrCreateUser({ lineUserId });
    const current = parseSyncedTags(user?.milestone_tags_synced);
    if (current.includes(tagName)) return;

    const next = [...current, tagName];
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from("users")
      .update({
        milestone_tags_synced: next,
        updated_at: new Date().toISOString(),
      })
      .eq("line_user_id", lineUserId);

    if (error) throw error;
  } catch (error) {
    console.warn("Supabase milestone tag sync marker failed:", safeSupabaseError(error));
  }
}

async function countReviewHistories(lineUserId) {
  const supabase = getSupabaseClient();
  const { count, error } = await supabase
    .from("review_histories")
    .select("id", { count: "exact", head: true })
    .eq("line_user_id", lineUserId);

  if (error) throw error;
  return count || 0;
}

export function parseSyncedTags(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value) return [];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function safeSupabaseError(error) {
  return {
    message: error?.message,
    code: error?.code,
    details: error?.details,
    hint: error?.hint,
  };
}
