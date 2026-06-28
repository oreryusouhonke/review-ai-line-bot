import { getMonthlyRanking, getUserReviewStats } from "./historyStore.js";
import { getBadgeProgress, getTitle } from "./badgeDefinitions.js";
import { getOrCreateUser } from "./userService.js";

export async function buildMyPageMessage(lineUserId) {
  console.log("myPageService called:", { hasUserId: Boolean(lineUserId) });

  if (!lineUserId) {
    return "LINEユーザーIDを取得できなかったため、マイページを表示できませんでした。もう一度お試しください。";
  }

  await getOrCreateUser({ lineUserId });
  const stats = await getUserReviewStats(lineUserId);
  const ranking = await getMonthlyRanking({ lineUserId, limit: 10 });
  const totalCount = stats.totalCount || 0;
  const monthCount = stats.monthCount || 0;
  const title = getTitle(totalCount);
  const earnedBadgeCount = getBadgeProgress(stats).filter((badge) => badge.earned).length;
  const nextLine = title.nextAt
    ? `⭐ 次の称号まで：あと${Math.max(title.nextAt - totalCount, 0)}件`
    : "⭐ 次の称号まで：最高称号です";

  return `👤 レビュー職人マイページ

🏆 称号：${title.name}
📝 累計口コミ作成：${totalCount}件
📅 今月：${monthCount}件
${nextLine}

🏅 獲得バッジ：${earnedBadgeCount}個
🏆 今月ランキング：${ranking.userRank.rank}位

メニュー：
・履歴
・ランキング
・バッジ
・お気に入り

※件数はGoogle投稿数ではなく、レビュー職人で作成した口コミ文の件数です。
※実際に利用した体験だけをもとに口コミ文を作成してください。`;
}
