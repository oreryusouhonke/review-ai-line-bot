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

    const payload = JSON.parse(body);
    const events = Array.isArray(payload?.events) ? payload.events : [];
    for (const event of events) {
      if (event.type === "message" && event.message?.type === "text") {
        handleTextMessage(event).catch((error) => {
          console.error("LINE event handling failed:", error);
        });
      }
    }
  }
);
