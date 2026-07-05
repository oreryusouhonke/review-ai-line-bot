import "dotenv/config";
import express from "express";
import { lineWebhookRouter } from "./routes/lineWebhook.js";
import { stripeWebhookRouter } from "./routes/stripeWebhook.js";
import { getStripeBillingStatus } from "./services/billingService.js";
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
    stripeBilling: getStripeBillingStatus(),
    reviewCountEnabled: true,
  });
});

app.get("/billing/success", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="ja">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>登録完了</title>
<body style="font-family:sans-serif;line-height:1.8;padding:32px;max-width:640px;margin:auto">
<h1>有料プランの登録が完了しました</h1>
<p>LINEに戻って、もう一度口コミ文の作成をお試しください。</p>
</body>
</html>`);
});

app.get("/billing/cancel", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="ja">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>登録キャンセル</title>
<body style="font-family:sans-serif;line-height:1.8;padding:32px;max-width:640px;margin:auto">
<h1>登録は完了していません</h1>
<p>LINEに戻って、必要なときにもう一度お手続きください。</p>
</body>
</html>`);
});

app.use("/webhook/stripe", stripeWebhookRouter);
app.use("/webhook/line", lineWebhookRouter);

app.listen(port, () => {
  console.log(`レビュー職人｜口コミ半自動化AI is running on http://localhost:${port}`);
});
