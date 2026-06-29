export const RANKS = [
  { name: "\u898b\u7fd2\u3044\u8077\u4eba", min: 0, nextAt: 5 },
  { name: "\u30ec\u30d3\u30e5\u30fc\u8077\u4eba", min: 5, nextAt: 20 },
  { name: "\u4e0a\u7d1a\u8077\u4eba", min: 20, nextAt: 50 },
  { name: "\u5e2b\u7bc4", min: 50, nextAt: 100 },
  { name: "\u540d\u4eba", min: 100, nextAt: 300 },
  { name: "\u5bb6\u5143", min: 300, nextAt: 1000 },
  { name: "\u4f1d\u8aac\u306e\u8077\u4eba", min: 1000, nextAt: null },
];

export const REVIEW_MILESTONES = [
  { count: 1, label: "\u521d\u56de\u5229\u7528", tagName: "\u30ec\u30d3\u30e5\u30fc\u8077\u4eba_\u521d\u56de\u5229\u7528" },
  { count: 5, label: "5\u56de\u9054\u6210", tagName: "\u30ec\u30d3\u30e5\u30fc\u8077\u4eba_5\u56de\u9054\u6210" },
  { count: 10, label: "10\u56de\u9054\u6210", tagName: "\u30ec\u30d3\u30e5\u30fc\u8077\u4eba_10\u56de\u9054\u6210" },
  { count: 20, label: "20\u56de\u9054\u6210", tagName: "\u30ec\u30d3\u30e5\u30fc\u8077\u4eba_20\u56de\u9054\u6210" },
  { count: 50, label: "50\u56de\u9054\u6210", tagName: "\u30ec\u30d3\u30e5\u30fc\u8077\u4eba_50\u56de\u9054\u6210" },
  { count: 100, label: "100\u56de\u9054\u6210", tagName: "\u30ec\u30d3\u30e5\u30fc\u8077\u4eba_100\u56de\u9054\u6210" },
  { count: 300, label: "300\u56de\u9054\u6210", tagName: "\u30ec\u30d3\u30e5\u30fc\u8077\u4eba_300\u56de\u9054\u6210" },
  { count: 1000, label: "1000\u56de\u9054\u6210", tagName: "\u30ec\u30d3\u30e5\u30fc\u8077\u4eba_1000\u56de\u9054\u6210" },
];

export const GENRE_TAG_DESIGNS = [
  { code: "restaurant", tagName: "\u30b8\u30e3\u30f3\u30eb_\u98f2\u98df\u5e97" },
  { code: "beauty", tagName: "\u30b8\u30e3\u30f3\u30eb_\u7f8e\u5bb9\u9662" },
  { code: "home_center", tagName: "\u30b8\u30e3\u30f3\u30eb_\u30db\u30fc\u30e0\u30bb\u30f3\u30bf\u30fc" },
  { code: "medical", tagName: "\u30b8\u30e3\u30f3\u30eb_\u75c5\u9662" },
  { code: "hotel", tagName: "\u30b8\u30e3\u30f3\u30eb_\u30db\u30c6\u30eb" },
  { code: "supermarket", tagName: "\u30b8\u30e3\u30f3\u30eb_\u30b9\u30fc\u30d1\u30fc" },
  { code: "tourism", tagName: "\u30b8\u30e3\u30f3\u30eb_\u89b3\u5149\u5730" },
  { code: "other", tagName: "\u30b8\u30e3\u30f3\u30eb_\u305d\u306e\u4ed6" },
];

export function getRank(reviewCount = 0) {
  const count = Number(reviewCount) || 0;
  return [...RANKS].reverse().find((rank) => count >= rank.min) || RANKS[0];
}

export function getNextRank(reviewCount = 0) {
  const rank = getRank(reviewCount);
  if (!rank.nextAt) return null;
  return RANKS.find((item) => item.min === rank.nextAt) || null;
}

export function getRankProgress(reviewCount = 0) {
  const count = Number(reviewCount) || 0;
  const rank = getRank(count);
  const nextRank = getNextRank(count);
  return {
    count,
    rank,
    nextRank,
    remaining: rank.nextAt ? Math.max(rank.nextAt - count, 0) : 0,
  };
}

export function getEarnedMilestones(reviewCount = 0) {
  const count = Number(reviewCount) || 0;
  return REVIEW_MILESTONES.filter((milestone) => count >= milestone.count);
}

export function getNewMilestoneTags(reviewCount = 0, syncedTags = []) {
  const synced = new Set(Array.isArray(syncedTags) ? syncedTags : []);
  return getEarnedMilestones(reviewCount)
    .map((milestone) => milestone.tagName)
    .filter((tagName) => !synced.has(tagName));
}
