import { getMonthlyRanking, getUserReviewStats } from "./historyStore.js";
import { getOrCreateUser } from "./userService.js";
import { getEarnedMilestones, getRankProgress } from "./rankService.js";

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
  const rankProgress = getRankProgress(totalCount);
  const earnedMilestones = getEarnedMilestones(totalCount);
  const nextRankLine = rankProgress.nextRank
    ? `次のランク：${rankProgress.nextRank.name}\n次のランクまで：あと${rankProgress.remaining}回`
    : "次のランク：最高ランク到達";
  const badgesLine = earnedMilestones.length
    ? earnedMilestones.map((milestone) => `・${milestone.label}`).join("\n")
    : "・まだありません";

  return `レビュー職人マイページ

累計口コミ作成数：${totalCount}回
今月の口コミ作成数：${monthCount}回
現在ランク：${rankProgress.rank.name}
${nextRankLine}

達成バッジ：
${badgesLine}

今月ランキング：${ranking.userRank.rank}位

メニュー：
・履歴
・ランキング
・バッジ
・お気に入り

※件数はGoogle投稿数ではなく、レビュー職人で作成した口コミ文の件数です。
※実際に利用した体験だけをもとに口コミ文を作成してください。`;
}
