const TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";

const CATEGORY_RULES = [
  { code: "ramen", label: "ラーメン", keywords: ["ramen"] },
  { code: "cafe", label: "カフェ", keywords: ["cafe", "coffee_shop"] },
  { code: "curry", label: "カレー", keywords: ["indian_restaurant"] },
  { code: "sushi", label: "寿司", keywords: ["sushi_restaurant"] },
  { code: "washoku", label: "和食", keywords: ["japanese_restaurant"] },
  { code: "sweets", label: "スイーツ", keywords: ["bakery", "dessert_shop", "ice_cream_shop"] },
  { code: "izakaya", label: "居酒屋", keywords: ["bar", "pub", "japanese_izakaya_restaurant"] },
  { code: "hotel", label: "宿泊", keywords: ["hotel", "lodging", "inn", "resort_hotel"] },
  { code: "beauty", label: "美容", keywords: ["beauty_salon", "hair_salon", "barber_shop", "spa", "nail_salon"] },
  { code: "life_service", label: "生活サービス", keywords: ["plumber", "electrician", "laundry", "locksmith", "real_estate_agency"] },
  { code: "medical", label: "医療・クリニック", keywords: ["hospital", "doctor", "dentist", "clinic", "pharmacy"] },
  { code: "shopping", label: "買い物", keywords: ["store", "shopping_mall", "supermarket", "convenience_store", "clothing_store"] },
  { code: "learning", label: "学び", keywords: ["school", "university", "training_centre", "preschool"] },
  { code: "car_transport", label: "車・移動", keywords: ["car_dealer", "car_repair", "gas_station", "parking", "taxi_stand", "transit_station"] },
];

export async function searchPlaces(query) {
  if (!process.env.GOOGLE_PLACES_API_KEY) {
    throw new Error("GOOGLE_PLACES_API_KEY is not set");
  }

  const normalizedQuery = normalizePlaceQuery(query);
  if (!normalizedQuery) return [];

  const primaryPlaces = await requestPlaces(normalizedQuery);
  const fallbackQuery = buildFallbackPlaceQuery(normalizedQuery);
  let fallbackPlaces = [];

  if (fallbackQuery && !hasStrongPlaceMatch(primaryPlaces, normalizedQuery)) {
    fallbackPlaces = await requestPlaces(fallbackQuery);
  }

  return mergeAndRankPlaces({
    primaryPlaces,
    fallbackPlaces,
    query: normalizedQuery,
    fallbackQuery,
  }).slice(0, 5).map(toPlaceResult);
}

async function requestPlaces(textQuery) {
  const response = await fetch(TEXT_SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": process.env.GOOGLE_PLACES_API_KEY,
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.googleMapsUri,places.rating,places.userRatingCount,places.primaryType,places.types",
    },
    body: JSON.stringify({
      textQuery,
      languageCode: "ja",
      regionCode: "JP",
      maxResultCount: 10,
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google Places API error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data.places || [];
}

export function normalizePlaceQuery(query) {
  return String(query || "")
    .normalize("NFKC")
    .replace(/[【】「」『』()（）［］\[\]]/g, " ")
    .replace(/[、,，/／・]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildFallbackPlaceQuery(query) {
  const tokens = normalizePlaceQuery(query).split(" ").filter(Boolean);
  if (tokens.length < 2) return "";

  // 地域名を先に書く一般的な入力では、末尾側が施設名であることが多い。
  // 末尾が短すぎる場合は、意味を失わないよう後ろ2語を残す。
  const last = tokens.at(-1);
  if (last.length >= 4) return last;
  return tokens.slice(-2).join(" ");
}

export function hasStrongPlaceMatch(places, query) {
  const compactQuery = compactPlaceText(query);
  return places.some((place) => {
    const name = compactPlaceText(place.displayName?.text);
    return name.length >= 3 && (
      name === compactQuery ||
      name.includes(compactQuery) ||
      compactQuery.includes(name)
    );
  });
}

export function mergeAndRankPlaces({ primaryPlaces, fallbackPlaces, query, fallbackQuery }) {
  const merged = new Map();
  [...primaryPlaces, ...fallbackPlaces].forEach((place, index) => {
    const key = place.id || `${place.displayName?.text || ""}:${place.formattedAddress || ""}`;
    if (!merged.has(key)) merged.set(key, { ...place, _sourceIndex: index });
  });

  const compactQuery = compactPlaceText(query);
  const compactFallback = compactPlaceText(fallbackQuery);
  const queryTokens = normalizePlaceQuery(query).split(" ").filter(Boolean);

  return [...merged.values()].sort((a, b) => {
    const score = (place) => {
      const name = compactPlaceText(place.displayName?.text);
      const address = compactPlaceText(place.formattedAddress);
      let value = Math.max(0, 20 - place._sourceIndex);
      if (name === compactQuery) value += 200;
      if (compactFallback && name === compactFallback) value += 180;
      if (name && (compactQuery.includes(name) || name.includes(compactQuery))) value += 100;
      if (compactFallback && name && (compactFallback.includes(name) || name.includes(compactFallback))) value += 90;
      for (const token of queryTokens) {
        const compactToken = compactPlaceText(token);
        if (compactToken.length >= 2 && name.includes(compactToken)) value += 20;
        if (compactToken.length >= 2 && address.includes(compactToken)) value += 8;
      }
      return value;
    };
    return score(b) - score(a);
  });
}

function compactPlaceText(value) {
  return normalizePlaceQuery(value).replace(/\s+/g, "").toLowerCase();
}

function toPlaceResult(place) {
  const category = classifyPlace(place);
  return {
    placeId: place.id,
    name: place.displayName?.text || "名称不明",
    address: place.formattedAddress || "住所不明",
    googleMapsUri: place.googleMapsUri || "",
    rating: place.rating || null,
    userRatingCount: place.userRatingCount ?? null,
    primaryType: place.primaryType || "",
    types: place.types || [],
    categoryCode: category.code,
    categoryLabel: category.label,
  };
}

function classifyPlace(place) {
  const haystack = [place.primaryType, ...(place.types || [])].filter(Boolean);
  const matched = CATEGORY_RULES.find((rule) =>
    rule.keywords.some((keyword) => haystack.some((type) => type.includes(keyword)))
  );

  return matched || { code: "other", label: "その他" };
}
