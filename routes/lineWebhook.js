import express from "express";
import { validateSignature } from "@line/bot-sdk";
import { handleTextMessage } from "../services/lineService.js";
import { forwardLineWebhookToHarness } from "../services/lineHarnessForwarder.js";
import { claimWebhookEvent } from "../services/webhookEventStore.js";

export const lineWebhookRouter = express.Router();
const userEventQueues = new Map();

lineWebhookRouter.post(
  "/",
  express.raw({ type: "application/json" }),
  (req, res) => {
    if (!process.env.LINE_CHANNEL_SECRET) {
      res.status(500).json({ ok: false, error: "LINE_CHANNEL_SECRET is not set" });
      return;
    }

    const body = req.body.toString("utf8");
    const signature = req.get("x-line-signature") || "";
    const shouldVerifySignature = shouldVerifyLineSignature();
    if (shouldVerifySignature && !validateSignature(body, process.env.LINE_CHANNEL_SECRET, signature)) {
      res.status(401).json({ ok: false, error: "Invalid LINE signature" });
      return;
    }

    res.status(200).end();

    forwardLineWebhookToHarness({ rawBody: body, signature }).catch((error) => {
      console.error("LINE Harness forwarding task failed:", error);
    });

    let payload;
    try {
      payload = JSON.parse(body);
    } catch (error) {
      console.error("LINE webhook JSON parse failed:", error);
      return;
    }

    const events = Array.isArray(payload?.events) ? payload.events : [];
    for (const event of events) {
      if (event.type !== "message" || event.message?.type !== "text") continue;

      console.log("LINE text event received:", {
        hasUserId: Boolean(event.source?.userId),
        hasReplyToken: Boolean(event.replyToken),
        textPreview: safeTextPreview(event.message?.text),
      });

      enqueueUserEvent(event.source?.userId, async () => {
        const claimed = await claimWebhookEvent(event.webhookEventId);
        if (!claimed) {
          console.log("Duplicate LINE webhook event skipped:", { webhookEventId: event.webhookEventId });
          return;
        }
        await handleTextMessage(event);
      });
    }
  }
);

export function enqueueUserEvent(userId, operation) {
  const queueKey = userId || "unknown";
  const previous = userEventQueues.get(queueKey) || Promise.resolve();
  const current = previous.then(operation, operation).catch((error) => {
    console.error("LINE event handling failed:", error);
  });
  userEventQueues.set(queueKey, current);
  current.finally(() => {
    if (userEventQueues.get(queueKey) === current) userEventQueues.delete(queueKey);
  });
  return current;
}

export function shouldVerifyLineSignature(env = process.env) {
  return env.NODE_ENV === "production" || env.LINE_VERIFY_SIGNATURE !== "false";
}

function safeTextPreview(text) {
  return String(text || "").trim().slice(0, 40);
}
