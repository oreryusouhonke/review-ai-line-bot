export const TITLE_LEVELS = [
  { min: 0, max: 9, name: "見習い職人", nextAt: 10 },
  { min: 10, max: 29, name: "銅職人", nextAt: 30 },
  { min: 30, max: 99, name: "銀職人", nextAt: 100 },
  { min: 100, max: 299, name: "金職人", nextAt: 300 },
  { min: 300, max: 499, name: "名人", nextAt: 500 },
  { min: 500, max: 999, name: "口コミ仙人", nextAt: 1000 },
  { min: 1000, max: Infinity, name: "口コミ神", nextAt: null },
];

export const TOTAL_BADGES = [
  { code: "total_1", label: "🏅 はじめの一歩", threshold: 1 },
  { code: "total_10", label: "📝 口コミ職人見習い", threshold: 10 },
  { code: "total_30", label: "🥉 銅の筆", threshold: 30 },
  { code: "total_100", label: "🥈 銀の筆", threshold: 100 },
  { code: "total_300", label: "🥇 金の筆", threshold: 300 },
  { code: "total_500", label: "👑 レビュー職人", threshold: 500 },
  { code: "total_1000", label: "🐉 口コミ神", threshold: 1000 },
];

export const MONTHLY_BADGES = [
  { code: "month_10", label: "📅 今月がんばった職人", threshold: 10 },
  { code: "month_30", label: "🚀 今月の猛者", threshold: 30 },
  { code: "month_50", label: "🏆 月間職人王", threshold: 50 },
];

export const CATEGORY_BADGES = [
  category("ramen", [["🍜 ラーメン好き", 5], ["🍜 ラーメン王", 10], ["🍜 ラーメン仙人", 30]]),
  category("cafe", [["☕ カフェ好き", 5], ["☕ カフェ巡礼者", 10], ["☕ カフェ仙人", 30]]),
  category("curry", [["🍛 カレー好き", 5], ["🍛 カレー王", 10], ["🍛 カレー仙人", 30]]),
  category("sushi", [["🍣 寿司好き", 5], ["🍣 寿司通", 10], ["🍣 寿司仙人", 30]]),
  category("sweets", [["🍰 スイーツ好き", 5], ["🍰 スイーツ職人", 10], ["🍰 スイーツ仙人", 30]]),
  category("izakaya", [["🍺 居酒屋好き", 5], ["🍺 居酒屋番長", 10], ["🍺 居酒屋仙人", 30]]),
  category("hotel", [["🏨 旅好き", 5], ["🏨 旅の職人", 10], ["🏨 旅の仙人", 30]]),
  category("beauty", [["💇 美容好き", 5], ["💇 美容職人", 10], ["💇 美容仙人", 30]]),
  category("life_service", [["🛠 くらしの相談役", 5], ["🛠 くらしの職人", 10], ["🛠 くらしの仙人", 30]]),
  category("medical", [["🏥 安心サポーター", 5], ["🏥 健康レビュー職人", 10], ["🏥 健康レビュー仙人", 30]]),
  category("shopping", [["🛒 お買い物好き", 5], ["🛒 お買い物名人", 10], ["🛒 お買い物仙人", 30]]),
  category("learning", [["🎓 学び好き", 5], ["🎓 学びの職人", 10], ["🎓 学びの仙人", 30]]),
  category("car_transport", [["🚗 ドライブ好き", 5], ["🚗 ドライブ職人", 10], ["🚗 ドライブ仙人", 30]]),
].flat();

export function getTitle(totalCount) {
  return TITLE_LEVELS.find((level) => totalCount >= level.min && totalCount <= level.max) || TITLE_LEVELS[0];
}

export function getBadgeProgress(stats) {
  const totalCount = stats.totalCount || 0;
  const monthCount = stats.monthCount || 0;
  const categoryCounts = stats.categoryCounts || {};

  const total = TOTAL_BADGES.map((badge) => progress(badge, totalCount));
  const monthly = MONTHLY_BADGES.map((badge) => progress(badge, monthCount));
  const categoryBadges = CATEGORY_BADGES.map((badge) => progress(badge, categoryCounts[badge.categoryCode] || 0));

  return [...total, ...monthly, ...categoryBadges];
}

function category(categoryCode, defs) {
  return defs.map(([label, threshold], index) => ({
    code: `${categoryCode}_${threshold}_${index}`,
    label,
    threshold,
    categoryCode,
  }));
}

function progress(badge, count) {
  return {
    ...badge,
    earned: count >= badge.threshold,
    remaining: Math.max(badge.threshold - count, 0),
  };
}
