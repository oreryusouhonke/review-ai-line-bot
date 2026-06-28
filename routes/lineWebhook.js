import express from "express";
import { validateSignature } from "@line/bot-sdk";
import { handleTextMessage } from "../services/lineService.js";

export const lineWebhookRouter = express.Router();

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
    if (!validateSignature(body, process.env.LINE_CHANNEL_SECRET, signature)) {
      res.status(401).json({ ok: false, error: "Invalid LINE signature" });
      return;
    }

    res.status(200).end();

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

      handleTextMessage(event).catch((error) => {
        console.error("LINE event handling failed:", error);
      });
    }
  }
);

function safeTextPreview(text) {
  return String(text || "").trim().slice(0, 40);
}
