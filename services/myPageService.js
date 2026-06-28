import { getUserReviewStats } from "./historyStore.js";
import { getOrCreateUser } from "./userService.js";

const LEVELS = [
  { min: 0, max: 9, name: "見習い職人", nextAt: 10 },
  { min: 10, max: 29, name: "銅職人", nextAt: 30 },
  { min: 30, max: 99, name: "銀職人", nextAt: 100 },
  { min: 100, max: 299, name: "金職人", nextAt: 300 },
  { min: 300, max: 999, name: "名人", nextAt: 1000 },
  { min: 1000, max: Infinity, name: "口コミ神", nextAt: null },
];

export async function buildMyPageMessage(lineUserId) {
  console.log("myPageService called:", { hasUserId: Boolean(lineUserId) });

  if (!lineUserId) {
    return "LINEユーザーIDを取得できなかったため、マイページを表示できませんでした。もう一度お試しください。";
  }

  await getOrCreateUser({ lineUserId });
  const stats = await getUserReviewStats(lineUserId);
  const totalCount = stats.totalCount || 0;
  const monthCount = stats.monthCount || 0;
  const level = getReviewLevel(totalCount);
  const nextLine = level.nextAt
    ? `⭐ 次のレベルまで：あと${Math.max(level.nextAt - totalCount, 0)}件`
    : "⭐ 次のレベルまで：最高レベルです";

  return `👤 レビュー職人マイページ

🏆 レベル：${level.name}
📝 累計口コミ作成：${totalCount}件
📅 今月：${monthCount}件
${nextLine}

※この件数はGoogleへの投稿完了数ではなく、口コミ文の作成数です。`;
}

export function getReviewLevel(totalCount) {
  return LEVELS.find((level) => totalCount >= level.min && totalCount <= level.max) || LEVELS[0];
}
