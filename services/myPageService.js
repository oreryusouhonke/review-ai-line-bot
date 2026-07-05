import { getMonthlyRanking, getUserReviewStats } from "./historyStore.js";
import { getOrCreateUser } from "./userService.js";
import { getEarnedMilestones, getRankProgress } from "./rankService.js";

// ランクごとの称号カラーと紋章
const RANK_STYLES = {
  "見習い職人": { color: "#9ca3af", emblem: "🔰" },
  "レビュー職人": { color: "#f97316", emblem: "⚒️" },
  "上級職人": { color: "#3b82f6", emblem: "🛠️" },
  "師範": { color: "#8b5cf6", emblem: "🎖️" },
  "名人": { color: "#ec4899", emblem: "🏅" },
  "家元": { color: "#eab308", emblem: "👑" },
  "伝説の職人": { color: "#ffd700", emblem: "🏆" },
};

export async function buildMyPageFlex(lineUserId) {
  await getOrCreateUser({ lineUserId });
  const stats = await getUserReviewStats(lineUserId);
  const ranking = await getMonthlyRanking({ lineUserId, limit: 10 });
  const totalCount = stats.totalCount || 0;
  const monthCount = stats.monthCount || 0;
  const rankProgress = getRankProgress(totalCount);
  const earnedMilestones = getEarnedMilestones(totalCount);
  const style = RANK_STYLES[rankProgress.rank.name] || RANK_STYLES["見習い職人"];

  // 現ランク区間内での進捗率（プログレスバー用）
  let progressPercent = 100;
  if (rankProgress.rank.nextAt) {
    const span = rankProgress.rank.nextAt - rankProgress.rank.min;
    progressPercent = Math.min(
      Math.round(((totalCount - rankProgress.rank.min) / span) * 100),
      100
    );
  }

  const badgeChips = earnedMilestones.slice(-6).map((milestone) => ({
    type: "text",
    text: `🎖 ${milestone.label}`,
    size: "xs",
    color: "#d1d5db",
    flex: 0,
  }));

  const statCell = (label, value, unit) => ({
    type: "box",
    layout: "vertical",
    flex: 1,
    contents: [
      { type: "text", text: label, size: "xxs", color: "#9ca3af", align: "center" },
      {
        type: "box",
        layout: "baseline",
        justifyContent: "center",
        contents: [
          { type: "text", text: String(value), size: "xl", weight: "bold", color: "#ffffff", flex: 0 },
          { type: "text", text: unit, size: "xxs", color: "#9ca3af", flex: 0, margin: "xs" },
        ],
      },
    ],
  });

  const menuButton = (label, text) => ({
    type: "button",
    style: "secondary",
    height: "sm",
    color: "#374151",
    flex: 1,
    action: { type: "message", label, text },
  });

  const contents = {
    type: "bubble",
    size: "mega",
    styles: { body: { backgroundColor: "#111827" }, footer: { backgroundColor: "#111827" } },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "20px",
      spacing: "md",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "REVIEW SHOKUNIN", size: "xxs", color: style.color, weight: "bold", flex: 1 },
            { type: "text", text: "MEMBER'S CARD", size: "xxs", color: "#6b7280", align: "end", flex: 1 },
          ],
        },
        {
          type: "box",
          layout: "vertical",
          margin: "md",
          contents: [
            { type: "text", text: style.emblem, size: "3xl", align: "center" },
            { type: "text", text: rankProgress.rank.name, size: "xxl", weight: "bold", color: style.color, align: "center" },
            {
              type: "text",
              text: rankProgress.nextRank
                ? `次の称号「${rankProgress.nextRank.name}」まで あと${rankProgress.remaining}回`
                : "最高ランク到達おめでとうございます",
              size: "xs",
              color: "#9ca3af",
              align: "center",
              margin: "sm",
              wrap: true,
            },
          ],
        },
        {
          type: "box",
          layout: "vertical",
          height: "6px",
          backgroundColor: "#374151",
          cornerRadius: "3px",
          margin: "md",
          contents: [
            {
              type: "box",
              layout: "vertical",
              width: `${Math.max(progressPercent, 4)}%`,
              height: "6px",
              backgroundColor: style.color,
              cornerRadius: "3px",
              contents: [{ type: "filler" }],
            },
          ],
        },
        { type: "separator", margin: "lg", color: "#374151" },
        {
          type: "box",
          layout: "horizontal",
          margin: "lg",
          contents: [
            statCell("累計作成", totalCount, "回"),
            statCell("今月作成", monthCount, "回"),
            statCell("今月ランク", `${ranking.userRank.rank}`, "位"),
          ],
        },
        ...(badgeChips.length
          ? [
              { type: "separator", margin: "lg", color: "#374151" },
              {
                type: "box",
                layout: "vertical",
                margin: "lg",
                spacing: "xs",
                contents: [
                  { type: "text", text: "達成バッジ", size: "xxs", color: "#9ca3af" },
                  ...badgeChips,
                ],
              },
            ]
          : []),
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      paddingAll: "16px",
      spacing: "sm",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          spacing: "sm",
          contents: [menuButton("履歴", "履歴"), menuButton("ランキング", "ランキング")],
        },
        {
          type: "box",
          layout: "horizontal",
          spacing: "sm",
          contents: [menuButton("バッジ", "バッジ"), menuButton("お気に入り", "お気に入り")],
        },
        {
          type: "text",
          text: "※件数はGoogle投稿数ではなく、作成した口コミ文の件数です",
          size: "xxs",
          color: "#6b7280",
          wrap: true,
          margin: "sm",
        },
      ],
    },
  };

  return { altText: `マイページ｜${rankProgress.rank.name}・累計${totalCount}回`, contents };
}

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
