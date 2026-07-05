import express from "express";
import Stripe from "stripe";
import {
  applyCheckoutCompleted,
  applySubscriptionChanged,
  applySubscriptionDeleted,
} from "../services/billingService.js";

export const stripeWebhookRouter = express.Router();

stripeWebhookRouter.post(
  "/",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
      res.status(500).json({ ok: false, error: "Stripe webhook is not configured" });
      return;
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const signature = req.get("stripe-signature");
    let event;

    try {
      event = stripe.webhooks.constructEvent(req.body, signature, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (error) {
      console.error("Stripe webhook signature verification failed:", error.message);
      res.status(400).json({ ok: false, error: "Invalid Stripe signature" });
      return;
    }

    try {
      if (event.type === "checkout.session.completed") {
        await applyCheckoutCompleted(event.data.object);
      } else if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") {
        await applySubscriptionChanged(event.data.object);
      } else if (event.type === "customer.subscription.deleted") {
        await applySubscriptionDeleted(event.data.object);
      }
    } catch (error) {
      console.error("Stripe webhook handling failed:", error);
      res.status(500).json({ ok: false, error: "Webhook handling failed" });
      return;
    }

    res.json({ received: true });
  }
);
