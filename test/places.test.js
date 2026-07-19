import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFallbackPlaceQuery,
  hasStrongPlaceMatch,
  mergeAndRankPlaces,
  normalizePlaceQuery,
} from "../services/placesService.js";

test("施設検索語の空白と記号を正規化する", () => {
  assert.equal(normalizePlaceQuery("【蓮沼】　海の家／ひらの"), "蓮沼 海の家 ひらの");
});

test("地域名つき検索から施設名の再検索語を作る", () => {
  assert.equal(buildFallbackPlaceQuery("蓮沼 海の家ひらの"), "海の家ひらの");
  assert.equal(buildFallbackPlaceQuery("海の家 ひらの"), "海の家 ひらの");
});

test("施設名に一致しない検索結果では多段検索を行う", () => {
  const park = [{ displayName: { text: "蓮沼海浜公園" } }];
  const shop = [{ displayName: { text: "海の家ひらの" } }];
  assert.equal(hasStrongPlaceMatch(park, "蓮沼 海の家ひらの"), false);
  assert.equal(hasStrongPlaceMatch(shop, "海の家ひらの"), true);
});

test("多段検索結果は施設名一致を優先して重複を除く", () => {
  const ranked = mergeAndRankPlaces({
    query: "蓮沼 海の家ひらの",
    fallbackQuery: "海の家ひらの",
    primaryPlaces: [
      { id: "park", displayName: { text: "蓮沼海浜公園" }, formattedAddress: "千葉県山武市蓮沼" },
    ],
    fallbackPlaces: [
      { id: "shop", displayName: { text: "海の家ひらの" }, formattedAddress: "千葉県山武市蓮沼" },
      { id: "park", displayName: { text: "蓮沼海浜公園" }, formattedAddress: "千葉県山武市蓮沼" },
    ],
  });
  assert.equal(ranked[0].id, "shop");
  assert.equal(ranked.length, 2);
});
