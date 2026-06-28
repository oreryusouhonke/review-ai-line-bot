import { getMonthlyRanking } from "./historyStore.js";

const MEDALS = ["🥇", "🥈", "🥉"];

export async function buildRankingMessage(lineUserId) {
  const ranking = await getMonthlyRanking({ lineUserId, limit: 10 });
  const topLines = ranking.top.length
    ? ranking.top.map((item, index) => `${MEDALS[index] || `${item.rank}位`}　${item.rank}位　${item.displayName}　${item.count}件`).join("\n")
    : "まだランキング対象の口コミ文作成がありません。";

  const user = ranking.userRank;
  const previous = ranking.top.find((item) => item.rank === user.rank - 1);
  const nextLine = previous && user.count < previous.count
    ? `あと${previous.count - user.count + 1}件で${previous.rank}位！`
    : user.rank === 1 && user.count > 0
      ? "現在トップです！"
      : "まずは1件作成してランキングに参加できます。";

  return `🏆 今月のレビュー職人ランキング

${topLines}

──────────

あなた
現在 ${user.rank}位　${user.count}件

${nextLine}

※このランキングはGoogleへの投稿数ではなく、レビュー職人で作成した口コミ文の件数です。
※実際に利用した体験だけをもとに口コミ文を作成してください。`;
}
