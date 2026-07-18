const BOOSTER_BASE_URL = (process.env.BOOSTER_BASE_URL || "https://kuchikomi-booster.vercel.app").replace(/\/+$/, "");
const HIDDEN_RECRUIT_LISTING_KEYWORDS = (process.env.RECRUIT_HIDDEN_KEYWORDS || "")
  .split(",")
  .map((keyword) => keyword.trim())
  .filter(Boolean);

function normalizeText(value = "") {
  return String(value).replace(/\s+/g, "").toLowerCase();
}

function isHiddenRecruitListing(listing) {
  const targetText = normalizeText(`${listing.storeName || ""} ${listing.description || ""}`);
  return HIDDEN_RECRUIT_LISTING_KEYWORDS.some((keyword) => targetText.includes(normalizeText(keyword)));
}

export async function fetchRecruitListings(region = "") {
  const url = new URL(`${BOOSTER_BASE_URL}/api/recruit/listings`);
  if (region) url.searchParams.set("region", region);
  url.searchParams.set("limit", "20");

  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`recruit listings fetch failed: ${response.status}`);
  const data = await response.json();
  const listings = Array.isArray(data.listings) ? data.listings : [];
  return listings.filter((listing) => !isHiddenRecruitListing(listing));
}

export function buildRecruitCarousel(listings) {
  const bubbles = listings.slice(0, 10).map((listing, index) => ({
    type: "bubble",
    size: "kilo",
    ...(listing.photoUrls?.[0]
      ? {
          hero: {
            type: "image",
            url: listing.photoUrls[0],
            size: "full",
            aspectRatio: "4:3",
            aspectMode: "cover",
          },
        }
      : {}),
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "14px",
      spacing: "sm",
      contents: [
        { type: "text", text: listing.storeName || "お店", weight: "bold", size: "lg", wrap: true },
        { type: "text", text: `📍 ${listing.region || ""}`, size: "xs", color: "#888888" },
        { type: "text", text: listing.description || "", size: "sm", wrap: true, color: "#333333" },
        ...(listing.visitPerk
          ? [
              {
                type: "box",
                layout: "vertical",
                backgroundColor: "#fff7ed",
                cornerRadius: "6px",
                paddingAll: "8px",
                contents: [
                  { type: "text", text: `🎁 来店特典：${listing.visitPerk}`, size: "xs", wrap: true, color: "#9a3412" },
                ],
              },
            ]
          : []),
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: [
        {
          type: "button",
          style: "primary",
          color: "#f97316",
          height: "sm",
          action: { type: "message", label: "このお店で口コミを作る", text: String(index + 1) },
        },
        {
          type: "text",
          text: "掲載店はお店からの掲載料でご紹介しています",
          size: "xxs",
          color: "#aaaaaa",
          align: "center",
          wrap: true,
        },
      ],
    },
  }));

  return { type: "carousel", contents: bubbles };
}

export function recruitGuideText() {
  return `募集店ボードのご案内

体験とご意見を歓迎しているお店の一覧です。気になるお店の「このお店で口コミを作る」を押すと、そのまま口コミ文の作成に進めます。

・来店して実際に体験した内容だけをもとに作成してください
・口コミを書くかどうかは自由です（報酬はありません）
・地域で絞りたいときは「募集店　千葉」のように送ってください`;
}
