import { getMonthlyRanking, getUserReviewStats } from "./historyStore.js";
import { getOrCreateUser } from "./userService.js";
import { getEarnedMilestones, getRankProgress } from "./rankService.js";

// ランクごとの称号カラー・紋章・カード配色
// bg: カード背景 / panel: 区切り線やバー土台 / text: メイン文字 / sub: 補助文字
const RANK_STYLES = {
  "見習い職人": {
    color: "#9ca3af", emblem: "🔰",
    bg: "#111827", panel: "#374151", text: "#ffffff", sub: "#9ca3af", button: "#374151",
  },
  "レビュー職人": {
    color: "#f97316", emblem: "⚒️",
    bg: "#111827", panel: "#374151", text: "#ffffff", sub: "#9ca3af", button: "#374151",
  },
  "上級職人": {
    color: "#60a5fa", emblem: "🛠️",
    bg: "#0f1a2e", panel: "#1e3a5f", text: "#ffffff", sub: "#93b4d4", button: "#1e3a5f",
  },
  "師範": {
    color: "#c4b5fd", emblem: "🎖️",
    bg: "#1e1033", panel: "#3b2764", text: "#ffffff", sub: "#b3a2d4", button: "#3b2764",
  },
  "名人": {
    color: "#f9a8d4", emblem: "🏅",
    bg: "#2d0f22", panel: "#5c2447", text: "#ffffff", sub: "#d4a2c0", button: "#5c2447",
  },
  "家元": {
    color: "#fbbf24", emblem: "👑",
    bg: "#291d05", panel: "#57430f", text: "#ffffff", sub: "#cdb377", button: "#57430f",
  },
  "伝説の職人": {
    color: "#7c5c00", emblem: "🏆",
    bg: "#f5d97a", panel: "#d4af37", text: "#3a2e00", sub: "#7c6a1e", button: "#b8952e",
  },
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
    color: style.sub,
    flex: 0,
  }));

  const statCell = (label, value, unit) => ({
    type: "box",
    layout: "vertical",
    flex: 1,
    contents: [
      { type: "text", text: label, size: "xxs", color: style.sub, align: "center" },
      {
        type: "box",
        layout: "baseline",
        justifyContent: "center",
        contents: [
          { type: "text", text: String(value), size: "xl", weight: "bold", color: style.text, flex: 0 },
          { type: "text", text: unit, size: "xxs", color: style.sub, flex: 0, margin: "xs" },
        ],
      },
    ],
  });

  const menuButton = (label, text) => ({
    type: "button",
    style: "secondary",
    height: "sm",
    color: style.button,
    flex: 1,
    action: { type: "message", label, text },
  });

  const contents = {
    type: "bubble",
    size: "mega",
    styles: { body: { backgroundColor: style.bg }, footer: { backgroundColor: style.bg } },
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
            { type: "text", text: "MEMBER'S CARD", size: "xxs", color: style.sub, align: "end", flex: 1 },
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
              color: style.sub,
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
          backgroundColor: style.panel,
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
        { type: "separator", margin: "lg", color: style.panel },
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
              { type: "separator", margin: "lg", color: style.panel },
              {
                type: "box",
                layout: "vertical",
                margin: "lg",
                spacing: "xs",
                contents: [
                  { type: "text", text: "達成バッジ", size: "xxs", color: style.sub },
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
          color: style.sub,
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
