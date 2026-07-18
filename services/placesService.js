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

  const response = await fetch(TEXT_SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": process.env.GOOGLE_PLACES_API_KEY,
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.googleMapsUri,places.rating,places.userRatingCount,places.primaryType,places.types",
    },
    body: JSON.stringify({
      textQuery: query,
      languageCode: "ja",
      regionCode: "JP",
      maxResultCount: 5,
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google Places API error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return (data.places || []).slice(0, 5).map((place) => {
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
  });
}

function classifyPlace(place) {
  const haystack = [place.primaryType, ...(place.types || [])].filter(Boolean);
  const matched = CATEGORY_RULES.find((rule) =>
    rule.keywords.some((keyword) => haystack.some((type) => type.includes(keyword)))
  );

  return matched || { code: "other", label: "その他" };
}
