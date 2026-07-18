import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { normalizeReviewLength } from "../services/aiReviewService.js";
import { getJstDayRange, getJstMonthRange } from "../services/jstDateRange.js";
import { formatRankingLines } from "../services/rankingService.js";
import { enqueueUserEvent, shouldVerifyLineSignature } from "../routes/lineWebhook.js";
import { claimJsonWebhookEvent } from "../services/webhookEventStore.js";

test("JSTの日付境界は日本時間0時になる", () => {
  const range = getJstDayRange(Date.parse("2026-07-18T15:30:00.000Z"));
  assert.deepEqual(range, {
    dayStart: "2026-07-18T15:00:00.000Z",
    nextDayStart: "2026-07-19T15:00:00.000Z",
  });
});

test("JSTの月境界は毎月1日0時になる", () => {
  const range = getJstMonthRange(Date.parse("2026-07-31T15:30:00.000Z"));
  assert.deepEqual(range, {
    monthStart: "2026-07-31T15:00:00.000Z",
    nextMonthStart: "2026-08-31T15:00:00.000Z",
  });
});

test("本番では署名検証を無効化できない", () => {
  assert.equal(shouldVerifyLineSignature({ NODE_ENV: "production", LINE_VERIFY_SIGNATURE: "false" }), true);
  assert.equal(shouldVerifyLineSignature({ NODE_ENV: "development", LINE_VERIFY_SIGNATURE: "false" }), false);
});

test("ランキング4位以下は順位を重複表示しない", () => {
  const lines = formatRankingLines([
    { rank: 1, displayName: "一郎", count: 4 },
    { rank: 2, displayName: "二郎", count: 3 },
    { rank: 3, displayName: "三郎", count: 2 },
    { rank: 4, displayName: "四郎", count: 1 },
  ]);
  assert.match(lines, /^🥇　1位/);
  assert.match(lines, /\n4位　四郎　1件$/);
  assert.doesNotMatch(lines, /4位　4位/);
});

test("同じユーザーのイベントは登録順に直列実行される", async () => {
  const order = [];
  const first = enqueueUserEvent("test-user", async () => {
    order.push("first:start");
    await new Promise((resolve) => setTimeout(resolve, 20));
    order.push("first:end");
  });
  const second = enqueueUserEvent("test-user", async () => {
    order.push("second");
  });
  await Promise.all([first, second]);
  assert.deepEqual(order, ["first:start", "first:end", "second"]);
});

test("同じWebhookイベントIDは2回処理しない", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "review-ai-event-test-"));
  const eventPath = path.join(tempDir, "events.json");
  try {
    assert.equal(await claimJsonWebhookEvent("event-1", eventPath), true);
    assert.equal(await claimJsonWebhookEvent("event-1", eventPath), false);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("Gemini出力は最大420文字相当へ制限する", () => {
  const normalized = normalizeReviewLength("あ".repeat(500));
  assert.equal(normalized.length, 420);
});
