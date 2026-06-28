import "dotenv/config";
import express from "express";
import { lineWebhookRouter } from "./routes/lineWebhook.js";
import { ensureSessionStore } from "./services/sessionStore.js";
import { ensureHistoryStore } from "./services/historyStore.js";

const app = express();
const port = Number(process.env.PORT || 3000);

await ensureSessionStore();
await ensureHistoryStore();

app.get("/", (_req, res) => {
  res.json({
    name: "レビューAI公式LINE Bot",
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
  });
});

app.use("/webhook/line", lineWebhookRouter);

app.listen(port, () => {
  console.log(`レビューAI公式LINE Bot is running on http://localhost:${port}`);
});
