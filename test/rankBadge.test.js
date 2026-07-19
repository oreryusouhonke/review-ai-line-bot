import assert from "node:assert/strict";
import test from "node:test";
import {
  CATEGORY_BADGES,
  MONTHLY_BADGES,
  TOTAL_BADGES,
  getBadgeProgress,
} from "../services/badgeDefinitions.js";
import { RANKS, getRankProgress } from "../services/rankService.js";

test("称号はすべての昇格境界で正しく切り替わる", () => {
  for (const [index, rank] of RANKS.entries()) {
    const atBoundary = getRankProgress(rank.min);
    assert.equal(atBoundary.rank.name, rank.name);

    if (index > 0) {
      const beforeBoundary = getRankProgress(rank.min - 1);
      assert.equal(beforeBoundary.rank.name, RANKS[index - 1].name);
      assert.equal(beforeBoundary.remaining, 1);
    }
  }
});

test("最高称号では残数が0になり次の称号がない", () => {
  const progress = getRankProgress(1000);
  assert.equal(progress.rank.name, "伝説の職人");
  assert.equal(progress.nextRank, null);
  assert.equal(progress.remaining, 0);
});

test("累計・月間・ジャンル別バッジを同時に判定できる", () => {
  const progress = getBadgeProgress({
    totalCount: 30,
    monthCount: 10,
    categoryCounts: { ramen: 5, cafe: 10 },
  });
  const earned = new Set(progress.filter((badge) => badge.earned).map((badge) => badge.code));

  assert.deepEqual(
    { total: TOTAL_BADGES.length, monthly: MONTHLY_BADGES.length, category: CATEGORY_BADGES.length },
    { total: 7, monthly: 3, category: 42 },
  );
  assert.equal(earned.has("total_30"), true);
  assert.equal(earned.has("month_10"), true);
  assert.equal(earned.has("ramen_5_0"), true);
  assert.equal(earned.has("cafe_10_1"), true);
  assert.equal(earned.has("month_30"), false);
});

test("バッジ達成直前は残り1件、達成時は残り0件になる", () => {
  const before = getBadgeProgress({
    totalCount: 9,
    monthCount: 9,
    categoryCounts: { ramen: 4 },
  });
  const after = getBadgeProgress({
    totalCount: 10,
    monthCount: 10,
    categoryCounts: { ramen: 5 },
  });

  for (const code of ["total_10", "month_10", "ramen_5_0"]) {
    assert.deepEqual(pick(before, code), { earned: false, remaining: 1 });
    assert.deepEqual(pick(after, code), { earned: true, remaining: 0 });
  }
});

test("0件では称号と全バッジが未達成になる", () => {
  assert.equal(getRankProgress(0).rank.name, "見習い職人");
  assert.equal(
    getBadgeProgress({ totalCount: 0, monthCount: 0, categoryCounts: {} })
      .some((badge) => badge.earned),
    false,
  );
});

function pick(progress, code) {
  const badge = progress.find((item) => item.code === code);
  return { earned: badge.earned, remaining: badge.remaining };
}
