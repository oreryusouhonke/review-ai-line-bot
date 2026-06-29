import "dotenv/config";
import express from "express";
import { lineWebhookRouter } from "./routes/lineWebhook.js";
import { ensureSessionStore } from "./services/sessionStore.js";
import { ensureHistoryStore } from "./services/historyStore.js";
import { isSupabaseConfigured } from "./services/supabaseClient.js";
import { isLineHarnessForwardingConfigured } from "./services/lineHarnessForwarder.js";
import { isLineHarnessTaggingConfigured } from "./services/lineHarnessService.js";

const app = express();
const port = Number(process.env.PORT || 3000);

await ensureSessionStore();
await ensureHistoryStore();

app.get("/", (_req, res) => {
  res.json({
    name: "レビュー職人｜口コミ半自動化AI",
    status: "ok",
    purpose: "Google口コミ用の文章作成支援。自動投稿はしません。",
  });
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    missingEnv: [
      "LINE_CHANNEL_ACCESS_TOKEN",
      "LINE_CHANNEL_SECRET",
      "GEMINI_API_KEY",
      "GOOGLE_PLACES_API_KEY",
    ].filter((key) => !process.env[key]),
    supabaseConfigured: isSupabaseConfigured(),
    lineHarnessForwardingConfigured: isLineHarnessForwardingConfigured(),
    lineHarnessTaggingConfigured: isLineHarnessTaggingConfigured(),
  });
});

app.use("/webhook/line", lineWebhookRouter);

app.listen(port, () => {
  console.log(`レビュー職人｜口コミ半自動化AI is running on http://localhost:${port}`);
});
