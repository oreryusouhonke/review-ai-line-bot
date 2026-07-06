import { getUserReviewStats } from "./historyStore.js";
import { getBadgeProgress } from "./badgeDefinitions.js";

const COLLECTION_STYLE = {
  bg: "#111827",
  panel: "#1f2937",
  card: "#ffffff",
  mutedCard: "#f3f4f6",
  line: "#374151",
  gold: "#fbbf24",
  orange: "#f97316",
  text: "#ffffff",
  sub: "#9ca3af",
  ink: "#111827",
  muted: "#6b7280",
};

export async function buildBadgesFlex(lineUserId) {
  const stats = await getUserReviewStats(lineUserId);
  const badges = getBadgeProgress(stats);
  const earned = badges.filter((badge) => badge.earned);
  const nextBadges = badges
    .filter((badge) => !badge.earned)
    .sort((a, b) => a.remaining - b.remaining)
    .slice(0, 6);
  const earnedRate = badges.length ? Math.round((earned.length / badges.length) * 100) : 0;
  const totalCount = stats.totalCount || 0;
  const monthCount = stats.monthCount || 0;
  const categoryCount = Object.values(stats.categoryCounts || {}).reduce((sum, count) => sum + Number(count || 0), 0);

  const contents = {
    type: "bubble",
    size: "mega",
    styles: {
      body: { backgroundColor: COLLECTION_STYLE.bg },
      footer: { backgroundColor: COLLECTION_STYLE.bg },
    },
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
            { type: "text", text: "REVIEW SHOKUNIN", size: "xxs", color: COLLECTION_STYLE.gold, weight: "bold", flex: 1 },
            { type: "text", text: "BADGE COLLECTION", size: "xxs", color: COLLECTION_STYLE.sub, align: "end", flex: 1 },
          ],
        },
        {
          type: "box",
          layout: "vertical",
          backgroundColor: COLLECTION_STYLE.panel,
          cornerRadius: "16px",
          paddingAll: "16px",
          spacing: "sm",
          contents: [
            { type: "text", text: "🏅 バッジコレクション", size: "xl", weight: "bold", color: COLLECTION_STYLE.text },
            {
              type: "text",
              text: earned.length ? `${earned.length}個のバッジを獲得中` : "まだバッジはありません。最初の1件から始めましょう。",
              size: "sm",
              color: COLLECTION_STYLE.sub,
              wrap: true,
            },
            {
              type: "box",
              layout: "horizontal",
              spacing: "sm",
              margin: "md",
              contents: [
                statPill("累計", `${totalCount}件`),
                statPill("今月", `${monthCount}件`),
                statPill("達成率", `${earnedRate}%`),
              ],
            },
            progressBar(earnedRate),
          ],
        },
        {
          type: "box",
          layout: "vertical",
          margin: "md",
          spacing: "sm",
          contents: [
            sectionTitle("獲得済みバッジ"),
            ...(earned.length ? earned.slice(-8).map((badge) => earnedBadgeCard(badge)) : [emptyCard("まだ獲得バッジはありません", "口コミ文を1件作成すると、最初のバッジが表示されます。")]),
          ],
        },
        {
          type: "box",
          layout: "vertical",
          margin: "md",
          spacing: "sm",
          contents: [
            sectionTitle("次に狙えるバッジ"),
            ...(nextBadges.length ? nextBadges.map((badge) => lockedBadgeCard(badge)) : [emptyCard("すべて獲得済みです", "表示対象のバッジをすべて集めています。")]),
          ],
        },
        {
          type: "text",
          text: categoryCount ? `ジャンル別の作成も進んでいます。得意ジャンルのバッジを集めていきましょう。` : "ジャンル別バッジは、同じジャンルの口コミ文を作ると集まります。",
          size: "xxs",
          color: COLLECTION_STYLE.sub,
          wrap: true,
          margin: "md",
        },
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
          contents: [
            menuButton("マイページ", "マイページ"),
            menuButton("履歴", "履歴"),
          ],
        },
        {
          type: "text",
          text: "※件数はGoogle投稿数ではなく、レビュー職人で作成した口コミ文の件数です。",
          size: "xxs",
          color: COLLECTION_STYLE.sub,
          wrap: true,
          margin: "sm",
        },
      ],
    },
  };

  return { altText: `バッジコレクション｜獲得${earned.length}個`, contents };
}

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

function statPill(label, value) {
  return {
    type: "box",
    layout: "vertical",
    flex: 1,
    backgroundColor: "#0f172a",
    cornerRadius: "12px",
    paddingAll: "10px",
    contents: [
      { type: "text", text: label, size: "xxs", color: COLLECTION_STYLE.sub, align: "center" },
      { type: "text", text: value, size: "lg", weight: "bold", color: COLLECTION_STYLE.gold, align: "center" },
    ],
  };
}

function progressBar(percent) {
  return {
    type: "box",
    layout: "vertical",
    height: "8px",
    backgroundColor: "#0f172a",
    cornerRadius: "4px",
    margin: "sm",
    contents: [
      {
        type: "box",
        layout: "vertical",
        width: `${Math.max(percent, 4)}%`,
        height: "8px",
        backgroundColor: COLLECTION_STYLE.gold,
        cornerRadius: "4px",
        contents: [{ type: "filler" }],
      },
    ],
  };
}

function sectionTitle(text) {
  return { type: "text", text, size: "sm", weight: "bold", color: COLLECTION_STYLE.gold };
}

function earnedBadgeCard(badge) {
  return {
    type: "box",
    layout: "horizontal",
    backgroundColor: COLLECTION_STYLE.card,
    cornerRadius: "14px",
    paddingAll: "12px",
    spacing: "sm",
    contents: [
      { type: "text", text: badgeEmoji(badge.label), size: "xxl", flex: 0 },
      {
        type: "box",
        layout: "vertical",
        flex: 1,
        contents: [
          { type: "text", text: badgeName(badge.label), size: "sm", weight: "bold", color: COLLECTION_STYLE.ink, wrap: true },
          { type: "text", text: `${badge.threshold}件達成`, size: "xxs", color: COLLECTION_STYLE.muted, margin: "xs" },
        ],
      },
      { type: "text", text: "GET", size: "xxs", weight: "bold", color: COLLECTION_STYLE.orange, align: "end", flex: 0 },
    ],
  };
}

function lockedBadgeCard(badge) {
  return {
    type: "box",
    layout: "horizontal",
    backgroundColor: COLLECTION_STYLE.mutedCard,
    cornerRadius: "14px",
    paddingAll: "12px",
    spacing: "sm",
    contents: [
      { type: "text", text: "🔒", size: "xl", flex: 0 },
      {
        type: "box",
        layout: "vertical",
        flex: 1,
        contents: [
          { type: "text", text: badgeName(badge.label), size: "sm", weight: "bold", color: COLLECTION_STYLE.ink, wrap: true },
          { type: "text", text: `あと${badge.remaining}件で獲得`, size: "xxs", color: COLLECTION_STYLE.muted, margin: "xs" },
        ],
      },
    ],
  };
}

function emptyCard(title, body) {
  return {
    type: "box",
    layout: "vertical",
    backgroundColor: COLLECTION_STYLE.card,
    cornerRadius: "14px",
    paddingAll: "14px",
    contents: [
      { type: "text", text: title, size: "sm", weight: "bold", color: COLLECTION_STYLE.ink, wrap: true },
      { type: "text", text: body, size: "xxs", color: COLLECTION_STYLE.muted, wrap: true, margin: "xs" },
    ],
  };
}

function menuButton(label, text) {
  return {
    type: "button",
    style: "primary",
    height: "sm",
    color: COLLECTION_STYLE.orange,
    flex: 1,
    action: { type: "message", label, text },
  };
}

function badgeEmoji(label) {
  const match = label.match(/^\p{Emoji_Presentation}|\p{Extended_Pictographic}/u);
  return match?.[0] || "🏅";
}
