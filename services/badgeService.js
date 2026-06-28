import { getUserReviewStats } from "./historyStore.js";
import { getBadgeProgress } from "./badgeDefinitions.js";

export async function buildBadgesMessage(lineUserId) {
  const stats = await getUserReviewStats(lineUserId);
  const badges = getBadgeProgress(stats);
  const earned = badges.filter((badge) => badge.earned);
  const unearned = badges
    .filter((badge) => !badge.earned)
    .sort((a, b) => a.remaining - b.remaining)
    .slice(0, 6);

  const earnedLines = earned.length
    ? earned.map((badge) => `✅ ${badgeName(badge.label)}`).join("\n")
    : "まだ獲得バッジはありません。まずは実体験にもとづく口コミ文を1件作成しましょう。";

  const unearnedLines = unearned.length
    ? unearned.map((badge) => `⬜ ${badgeName(badge.label)}\nあと${badge.remaining}件で獲得`).join("\n\n")
    : "すべての表示対象バッジを獲得しています。";

  return `🏅 獲得バッジ

${earnedLines}

未獲得バッジ

${unearnedLines}

※件数はGoogle投稿数ではなく、レビュー職人で作成した口コミ文の件数です。
※実際に利用した体験だけをもとに口コミ文を作成してください。`;
}

function badgeName(label) {
  return label.replace(/^[^\p{L}\p{N}]+\s*/u, "");
}
