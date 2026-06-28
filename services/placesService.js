const TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";

export async function searchPlaces(query) {
  if (!process.env.GOOGLE_PLACES_API_KEY) {
    throw new Error("GOOGLE_PLACES_API_KEY is not set");
  }

  const response = await fetch(TEXT_SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": process.env.GOOGLE_PLACES_API_KEY,
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.googleMapsUri,places.rating,places.userRatingCount",
    },
    body: JSON.stringify({
      textQuery: query,
      languageCode: "ja",
      regionCode: "JP",
      maxResultCount: 5,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google Places API error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return (data.places || []).slice(0, 5).map((place) => ({
    placeId: place.id,
    name: place.displayName?.text || "名称不明",
    address: place.formattedAddress || "住所不明",
    googleMapsUri: place.googleMapsUri || "",
    rating: place.rating || null,
    userRatingCount: place.userRatingCount ?? null,
  }));
}
