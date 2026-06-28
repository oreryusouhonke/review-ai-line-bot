import { getUserReviewStats } from "./historyStore.js";

const LEVELS = [
  { min: 0, max: 9, name: "見習い職人", nextAt: 10 },
  { min: 10, max: 29, name: "銅職人", nextAt: 30 },
  { min: 30, max: 99, name: "銀職人", nextAt: 100 },
  { min: 100, max: 299, name: "金職人", nextAt: 300 },
  { min: 300, max: 999, name: "名人", nextAt: 1000 },
  { min: 1000, max: Infinity, name: "口コミ神", nextAt: null },
];

export async function buildMyPageMessage(userId) {
  const stats = await getUserReviewStats(userId);
  const level = getReviewLevel(stats.totalCount);
  const nextLine = level.nextAt
    ? `⭐ 次のレベルまで：あと${Math.max(level.nextAt - stats.totalCount, 0)}件`
    : "⭐ 次のレベルまで：最高レベルです";

  return `👤 レビュー職人マイページ

🏆 レベル：${level.name}
📝 累計口コミ作成：${stats.totalCount}件
📅 今月：${stats.monthCount}件
${nextLine}

※この件数はGoogleへの投稿完了数ではなく、口コミ文の作成数です。`;
}

export function getReviewLevel(totalCount) {
  return LEVELS.find((level) => totalCount >= level.min && totalCount <= level.max) || LEVELS[0];
}
