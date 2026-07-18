import { Client } from "@line/bot-sdk";
import { createReview, reviseReview } from "./aiReviewService.js";
import { addHistory, addReviewHistory, getUserReviewStats } from "./historyStore.js";
import { buildBadgesFlex, buildBadgesMessage } from "./badgeService.js";
import { buildFavoritesMessage } from "./favoriteService.js";
import { buildMyPageFlex, buildMyPageMessage } from "./myPageService.js";
import { buildRankingMessage } from "./rankingService.js";
import { syncReviewMilestonesToHarness, tagReviewCreatedInHarness } from "./lineHarnessService.js";
import { searchPlaces } from "./placesService.js";
import { buildRecruitCarousel, fetchRecruitListings, recruitGuideText } from "./recruitBoardService.js";
import { recordReviewGenerated } from "./userService.js";
import { checkGenerationAccess } from "./billingService.js";
import {
  clearSession,
  getSession,
  saveSession,
  setGenerating,
} from "./sessionStore.js";

const RAW_GLOBAL_COMMANDS = {
  mypage: ["マイページ", "まいぺーじ", "ﾏｲﾍﾟｰｼﾞ", "mypage", "MyPage", "MYページ", "プロフィール"],
  history: ["履歴", "りれき", "history"],
  ranking: ["ランキング", "らんきんぐ", "ranking"],
  favorite: ["お気に入り", "お気にいり", "おきにいり", "favorite", "favorites"],
  badge: ["バッジ", "ばっじ", "badge", "badges"],
  help: ["ヘルプ", "help", "使い方"],
  reset: ["開始", "キャンセル", "リセット", "やり直し", "start", "reset", "cancel"],
};

const GLOBAL_COMMANDS = Object.fromEntries(
  Object.entries(RAW_GLOBAL_COMMANDS).map(([command, aliases]) => [
    command,
    new Set(aliases.map(commandKey)),
  ])
);

const START_MESSAGE = `レビューAIです😊

口コミを作りたいお店・施設の
「地域名」と「店名」を送ってください。

【例】
上野　〇〇商店
銀座　〇〇医院
池袋　〇〇美容室
千葉　〇〇ホームセンター

飲食店以外でも使えます。`;

let cachedLineClient = null;

export async function handleTextMessage(event) {
  const userId = event.source?.userId;
  const replyToken = event.replyToken;
  const text = normalizeText(event.message?.text);
  const command = detectGlobalCommand(text);

  console.log("LINE text handling:", {
    hasUserId: Boolean(userId),
    hasReplyToken: Boolean(replyToken),
    textPreview: text.slice(0, 40),
    globalCommand: command || null,
  });

  if (!replyToken) return;
  if (!userId) {
    await reply(replyToken, "LINEユーザーIDを取得できなかったため、処理できませんでした。もう一度お試しください。");
    return;
  }

  const session = await getSession(userId);
  console.log("LINE session state:", {
    hasUserId: true,
    sessionStep: session?.step || null,
    generating: Boolean(session?.generating),
    globalCommand: command || null,
  });

  try {
    // 募集店ボード（「募集店」「募集店　千葉」のように地域指定も可能）
    const recruitMatch = text.match(/^募集店[\s　]*(.*)$/);
    if (recruitMatch) {
      await handleRecruitBoard(userId, replyToken, recruitMatch[1].trim());
      return;
    }

    if (command) {
      await handleGlobalCommand({ command, userId, replyToken });
      return;
    }

    if (!session) {
      await saveSession(userId, {
        step: "awaiting_place_query",
        updatedAt: new Date().toISOString(),
      });
      await reply(replyToken, startMessage());
      return;
    }

    if (session.generating) {
      await reply(replyToken, "口コミ文を作成中です。少し待ってから送ってください。");
      return;
    }

    if (session.step === "awaiting_place_query") {
      await handlePlaceQuery(userId, replyToken, text);
      return;
    }

    if (session.step === "awaiting_recruit_selection") {
      await handleRecruitSelection(userId, replyToken, text, session);
      return;
    }

    if (session.step === "awaiting_place_selection") {
      await handlePlaceSelection(userId, replyToken, text, session);
      return;
    }

    if (session.step === "awaiting_visit_purpose") {
      await handleVisitPurpose(userId, replyToken, text, session);
      return;
    }

    if (session.step === "awaiting_impression") {
      await handleImpression(userId, replyToken, text, session);
      return;
    }

    if (session.step === "awaiting_feeling") {
      await handleFeeling(userId, replyToken, text, session);
      return;
    }

    if (session.step === "completed" && text.startsWith("修正：")) {
      await handleRevision(userId, replyToken, text.replace(/^修正：/, "").trim(), session);
      return;
    }

    await reply(replyToken, "続ける場合は「修正：もっと自然に」、最初から始める場合は「リセット」と送ってください。");
  } catch (error) {
    console.error("message flow failed:", error);
    await setGenerating(userId, false);
    await reply(replyToken, `エラーが発生しました。\n${friendlyError(error)}\n\n「リセット」と送ると最初からやり直せます。`);
  }
}

async function handleGlobalCommand({ command, userId, replyToken }) {
  console.log("Global command matched:", { command, hasUserId: Boolean(userId) });

  if (command === "mypage") {
    console.log("Calling myPageService:", { hasUserId: Boolean(userId) });
    try {
      const { altText, contents } = await buildMyPageFlex(userId);
      await replyFlex(replyToken, altText, contents);
    } catch (error) {
      console.warn("MyPage flex failed, falling back to text:", error?.message);
      await reply(replyToken, await buildMyPageMessage(userId));
    }
    return;
  }

  if (command === "history") {
    const stats = await getUserReviewStats(userId);
    await reply(replyToken, `口コミ文作成履歴

累計：${stats.totalCount || 0}件
今月：${stats.monthCount || 0}件

※Googleへの投稿完了数ではなく、口コミ文の作成数です。`);
    return;
  }

  if (command === "ranking") {
    await reply(replyToken, await buildRankingMessage(userId));
    return;
  }

  if (command === "favorite") {
    await reply(replyToken, await buildFavoritesMessage());
    return;
  }

  if (command === "badge") {
    try {
      const { altText, contents } = await buildBadgesFlex(userId);
      await replyFlex(replyToken, altText, contents);
    } catch (error) {
      console.warn("Badge flex failed, falling back to text:", error?.message);
      await reply(replyToken, await buildBadgesMessage(userId));
    }
    return;
  }

  if (command === "help") {
    await replyFlex(replyToken, "レビュー職人の使い方", buildManualCarousel());
    return;
  }

  if (command === "reset") {
    await clearSession(userId);
    await saveSession(userId, {
      step: "awaiting_place_query",
      updatedAt: new Date().toISOString(),
    });
    await reply(replyToken, startMessage());
  }
}

async function handlePlaceQuery(userId, replyToken, query) {
  const places = await searchPlaces(query);
  if (!places.length) {
    await reply(replyToken, "候補が見つかりませんでした。\n店名と地域を少し変えて送ってください。\n\n例：匝瑳市 ブリッジ");
    return;
  }

  await saveSession(userId, {
    step: "awaiting_place_selection",
    placeQuery: query,
    candidates: places,
    updatedAt: new Date().toISOString(),
  });

  await reply(replyToken, `候補が見つかりました。\n\n${formatPlaces(places)}\n\n${placeSelectionGuide()}`);
}

async function handleRecruitBoard(userId, replyToken, keyword) {
  let allListings = [];
  try {
    allListings = await fetchRecruitListings("");
  } catch (error) {
    console.error("recruit board fetch failed:", error);
    await reply(replyToken, "募集店ボードを読み込めませんでした。少し待ってからもう一度お試しください。");
    return;
  }

  let listings = allListings;
  if (keyword) {
    // 店名一致（Webページの「LINEで口コミを作る」からの深リンク）なら直接開始
    const nameMatches = allListings.filter(
      (item) => item.storeName && (item.storeName.includes(keyword) || keyword.includes(item.storeName))
    );
    if (nameMatches.length === 1) {
      await startRecruitReview(userId, replyToken, nameMatches[0]);
      return;
    }
    // 地域での絞り込み
    const regionMatches = allListings.filter((item) => (item.region || "").includes(keyword));
    listings = regionMatches.length ? regionMatches : nameMatches;
  }

  if (!listings.length) {
    await reply(
      replyToken,
      keyword
        ? `「${keyword}」の募集店は今のところありません。\n「募集店」と送ると全国の一覧を見られます。`
        : "現在、募集店の掲載はありません。掲載が始まるとここに表示されます。"
    );
    return;
  }

  await saveSession(userId, {
    step: "awaiting_recruit_selection",
    recruitCandidates: listings,
    updatedAt: new Date().toISOString(),
  });

  await replyMessages(replyToken, [
    { type: "text", text: recruitGuideText() },
    { type: "flex", altText: "募集店ボード", contents: buildRecruitCarousel(listings) },
  ]);
}

async function handleRecruitSelection(userId, replyToken, text, session) {
  const selectionNumber = parsePlaceSelectionNumber(text);
  const candidates = Array.isArray(session.recruitCandidates) ? session.recruitCandidates : [];
  const listing = selectionNumber === null ? null : candidates[selectionNumber - 1];

  if (!listing) {
    // 番号以外が来たら通常の店探しとして扱う
    await saveSession(userId, {
      step: "awaiting_place_query",
      updatedAt: new Date().toISOString(),
    });
    await handlePlaceQuery(userId, replyToken, text);
    return;
  }

  await startRecruitReview(userId, replyToken, listing);
}

async function startRecruitReview(userId, replyToken, listing) {
  const selectedPlace = {
    placeId: listing.placeId || "",
    name: listing.storeName || "お店",
    address: listing.region || "",
    categoryCode: "other",
    categoryLabel: "その他",
    fromRecruit: true,
  };

  await saveSession(userId, {
    step: "awaiting_visit_purpose",
    selectedPlace,
    reviewAnswers: {},
    updatedAt: new Date().toISOString(),
  });

  await reply(replyToken, firstQuestionMessage(selectedPlace));
}

async function handlePlaceSelection(userId, replyToken, text, session) {
  const selectionNumber = parsePlaceSelectionNumber(text);
  if (selectionNumber === null) {
    await handlePlaceQuery(userId, replyToken, text);
    return;
  }

  const index = selectionNumber - 1;
  const candidates = Array.isArray(session.candidates) ? session.candidates : [];
  const selectedPlace = candidates[index];

  if (!selectedPlace) {
    await reply(replyToken, placeSelectionGuide());
    return;
  }

  await saveSession(userId, {
    ...session,
    step: "awaiting_visit_purpose",
    selectedPlace,
    reviewAnswers: {},
    updatedAt: new Date().toISOString(),
  });

  await reply(replyToken, firstQuestionMessage(selectedPlace));
}

async function handleVisitPurpose(userId, replyToken, text, session) {
  await saveSession(userId, {
    ...session,
    step: "awaiting_impression",
    reviewAnswers: {
      ...(session.reviewAnswers || {}),
      purpose: text,
    },
    updatedAt: new Date().toISOString(),
  });

  await reply(replyToken, secondQuestionMessage());
}

async function handleImpression(userId, replyToken, text, session) {
  await saveSession(userId, {
    ...session,
    step: "awaiting_feeling",
    reviewAnswers: {
      ...(session.reviewAnswers || {}),
      impression: text,
    },
    updatedAt: new Date().toISOString(),
  });

  await reply(replyToken, thirdQuestionMessage());
}

async function handleFeeling(userId, replyToken, text, session) {
  const reviewAnswers = {
    ...(session.reviewAnswers || {}),
    feeling: text,
  };
  const experienceMemo = buildExperienceMemo(reviewAnswers);
  const billing = await checkGenerationAccess(userId);
  if (!billing.allowed) {
    await reply(replyToken, paywallMessage(billing));
    return;
  }

  await setGenerating(userId, true);
  await showLoadingAnimation(userId);

  try {
    const review = await createReview({
      place: session.selectedPlace,
      experienceMemo,
    });

    const nextSession = {
      ...session,
      step: "completed",
      reviewAnswers,
      experienceMemo,
      lastReview: review,
      generating: false,
      updatedAt: new Date().toISOString(),
    };

    await saveSession(userId, nextSession);
    await addReviewHistory({
      userId,
      lineUserId: userId,
      place: session.selectedPlace,
      experienceMemo,
      review,
      type: "create",
    });

    const userRecord = await recordReviewGenerated(userId);
    const stats = await getUserReviewStats(userId);
    tagReviewCreatedInHarness(userId);
    syncReviewMilestonesToHarness(userId, userRecord);
    await replyReviewMessages(replyToken, userId, review, session.selectedPlace, stats);
  } catch (error) {
    console.error("review generation failed:", error);
    await setGenerating(userId, false);
    await push(userId, `エラーが発生しました。\n${friendlyError(error)}\n\n「リセット」と送ると最初からやり直せます。`);
  }
}

async function handleRevision(userId, replyToken, revisionRequest, session) {
  if (!session.lastReview || !session.experienceMemo || !session.selectedPlace) {
    await reply(replyToken, "修正できる口コミ文がありません。「リセット」して最初から作成してください。");
    return;
  }
  const billing = await checkGenerationAccess(userId);
  if (!billing.allowed) {
    await reply(replyToken, paywallMessage(billing));
    return;
  }

  await setGenerating(userId, true);
  await showLoadingAnimation(userId);

  try {
    const review = await reviseReview({
      place: session.selectedPlace,
      experienceMemo: session.experienceMemo,
      currentReview: session.lastReview,
      revisionRequest,
    });

    await saveSession(userId, {
      ...session,
      lastReview: review,
      generating: false,
      updatedAt: new Date().toISOString(),
    });
    await addHistory({
      userId,
      place: session.selectedPlace,
      experienceMemo: session.experienceMemo,
      review,
      revisionRequest,
      type: "revise",
    });

    tagReviewCreatedInHarness(userId);
    await replyReviewMessages(replyToken, userId, review, session.selectedPlace);
  } catch (error) {
    console.error("review revision failed:", error);
    await setGenerating(userId, false);
    await push(userId, `エラーが発生しました。\n${friendlyError(error)}\n\n「リセット」と送ると最初からやり直せます。`);
  }
}

async function reply(replyToken, text) {
  await replyMessages(replyToken, [{ type: "text", text }]);
}

async function replyFlex(replyToken, altText, contents) {
  await replyMessages(replyToken, [{ type: "flex", altText, contents }]);
}

async function replyMessages(replyToken, messages) {
  await getLineClient().replyMessage(replyToken, messages);
}

async function push(userId, text) {
  await getLineClient().pushMessage(userId, { type: "text", text });
}

async function replyReviewMessages(replyToken, userId, review, place, stats = null) {
  const meta = stats
    ? `${formatReviewMeta(review, place)}\n\n${formatAchievement(stats)}`
    : formatReviewMeta(review, place);
  try {
    await replyMessages(replyToken, [
      { type: "text", text: review },
      { type: "text", text: meta },
    ]);
  } catch (error) {
    console.warn("LINE review reply failed; falling back to push:", error);
    await push(userId, review);
    await push(userId, meta);
  }
}

async function showLoadingAnimation(userId) {
  if (!process.env.LINE_CHANNEL_ACCESS_TOKEN) {
    console.warn("LINE loading animation skipped: LINE_CHANNEL_ACCESS_TOKEN is not set");
    return;
  }
  try {
    const response = await fetch("https://api.line.me/v2/bot/chat/loading/start", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ chatId: userId, loadingSeconds: 30 }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error(`LINE loading animation failed: ${response.status}`);
  } catch (error) {
    console.warn("LINE loading animation failed; continuing generation:", error);
  }
}

function getLineClient() {
  if (!process.env.LINE_CHANNEL_ACCESS_TOKEN) {
    throw new Error("LINE_CHANNEL_ACCESS_TOKEN is not set");
  }
  if (!cachedLineClient) {
    cachedLineClient = new Client({
      channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
    });
  }
  return cachedLineClient;
}

function buildExperienceMemo({ purpose = "", impression = "", feeling = "" }) {
  return `目的：
${purpose}

印象に残ったこと：
${impression}

感じたこと：
${feeling}`;
}

function firstQuestionMessage(place) {
  return `「${place.name}」ですね。

質問1/3
どのような目的で利用しましたか？

例：食事、買い物、相談、打ち合わせ、修理、宿泊、セミナーなど`;
}

function secondQuestionMessage() {
  return `質問2/3
実際に利用して、印象に残ったことは何ですか？

例：対応、雰囲気、説明、仕上がり、使いやすさ、価格、場所など`;
}

function thirdQuestionMessage() {
  return `質問3/3
利用してみて、どう感じましたか？

例：満足した、安心できた、便利だった、また利用したいなど`;
}

function detectGlobalCommand(text) {
  const key = commandKey(text);
  for (const [command, aliases] of Object.entries(GLOBAL_COMMANDS)) {
    if (aliases.has(key)) return command;
  }
  return null;
}

function commandKey(text) {
  return toFullWidthKana(String(text || ""))
    .normalize("NFKC")
    .replace(/[\s　]+/g, "")
    .toLowerCase();
}

function normalizeText(text) {
  return String(text || "").normalize("NFKC").trim();
}

function toFullWidthKana(text) {
  return text.replace(/[\uFF61-\uFF9F]+/g, (part) => part.normalize("NFKC"));
}

function toHalfWidthNumber(text) {
  return String(text).replace(/[０-９]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0xfee0)
  );
}

function parsePlaceSelectionNumber(text) {
  const normalized = String(text || "").normalize("NFKC").trim();
  if (/^[1-5]$/.test(normalized)) {
    return Number(normalized);
  }
  return /^\d+$/.test(normalized) ? Number(normalized) : null;
}

function placeSelectionGuide() {
  return `候補の番号（1〜5）を送ってください😊

候補にない場合は、お店や施設名をそのまま入力してください。

レビュー職人は飲食店だけではなく、Googleマップに掲載されている施設ならご利用いただけます。

【例】
🍜 飲食店
💇 美容院・理容室
🏥 病院・歯科医院
🛒 スーパー・ホームセンター
🏨 ホテル・旅館
🏞️ 観光施設
⛽ ガソリンスタンド
🚗 カーディーラー`;
}

function startMessage() {
  return START_MESSAGE;
}

function buildManualCarousel() {
  const steps = [
    {
      step: "STEP 1",
      title: "お店を探す",
      body: "「地域名」と「店名」を送ってください。\n\n例：\n上野　〇〇商店\n銀座　〇〇医院\n\n飲食店以外でも使えます。",
      action: { type: "message", label: "開始する", text: "開始" },
    },
    {
      step: "STEP 2",
      title: "お店を選ぶ",
      body: "候補のお店が最大5件表示されます。\n\n作りたいお店の「番号」を送ってください。\n\n例：1",
    },
    {
      step: "STEP 3",
      title: "体験を教える",
      body: "質問に沿って、実際の体験を送ってください。\n\n・何をしに行った？\n・良かったところは？\n・どう感じた？\n\n短いメモでOKです。",
    },
    {
      step: "STEP 4",
      title: "口コミ文が完成",
      body: "AIが口コミ文を作成します。\n\n本文をコピーして、届いたリンクからGoogleに投稿してください。\n\n※自動投稿はしません。投稿前に内容をご確認ください。",
    },
    {
      step: "STEP 5",
      title: "修正もできる",
      body: "できた文章を直したいときは\n\n「修正：もっとカジュアルに」\n「修正：短くして」\n\nのように送ると作り直せます。",
    },
    {
      step: "募集店",
      title: "お店の募集を見る",
      body: "「募集店」と送ると、体験とご意見を歓迎しているお店の一覧が見られます。\n\n気になるお店に行って、そのまま口コミ文を作成できます。\n\n地域で絞るには「募集店　千葉」のように送ってください。",
      action: { type: "message", label: "募集店を見る", text: "募集店" },
    },
    {
      step: "お楽しみ①",
      title: "称号ランク",
      body: "口コミ文を作るほど称号が上がります。\n\n🔰 見習い職人（0回〜）\n⚒️ レビュー職人（5回〜）\n🛠️ 上級職人（20回〜）\n🎖️ 師範（50回〜）\n🏅 名人（100回〜）\n👑 家元（300回〜）\n🏆 伝説の職人（1000回〜）",
      action: { type: "message", label: "マイページで確認", text: "マイページ" },
    },
    {
      step: "お楽しみ②",
      title: "バッジを集める",
      body: "3種類のバッジがあります。\n\n🏅 累計バッジ：作成回数で獲得\n📅 月間バッジ：月10回以上で獲得\n🍜 ジャンル別バッジ：ラーメン・カフェ・和食・美容など14ジャンル、同じジャンル5回で獲得",
      action: { type: "message", label: "バッジを見る", text: "バッジ" },
    },
    {
      step: "お楽しみ③",
      title: "履歴とランキング",
      body: "「履歴」：今まで作った口コミ文の件数を確認できます。\n\n「ランキング」：今月の作成数を他の職人と競えます。毎月1日にリセットされます。",
      action: { type: "message", label: "ランキングを見る", text: "ランキング" },
    },
    {
      step: "便利機能",
      title: "コマンド一覧",
      body: "マイページ：あなたの会員証\n履歴：作った口コミ文の件数\nランキング：今月の作成数順位\nバッジ：獲得バッジ\nお気に入り：お気に入りのお店\nリセット：最初からやり直す",
      action: { type: "message", label: "マイページを見る", text: "マイページ" },
    },
  ];

  return {
    type: "carousel",
    contents: steps.map((item) => ({
      type: "bubble",
      size: "kilo",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#f97316",
        paddingAll: "12px",
        contents: [
          {
            type: "text",
            text: item.step,
            color: "#ffe9d6",
            size: "xs",
            weight: "bold",
          },
          {
            type: "text",
            text: item.title,
            color: "#ffffff",
            size: "lg",
            weight: "bold",
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "14px",
        contents: [
          {
            type: "text",
            text: item.body,
            wrap: true,
            size: "sm",
            color: "#333333",
          },
        ],
      },
      ...(item.action
        ? {
            footer: {
              type: "box",
              layout: "vertical",
              contents: [
                {
                  type: "button",
                  style: "primary",
                  color: "#f97316",
                  height: "sm",
                  action: item.action,
                },
              ],
            },
          }
        : {}),
    })),
  };
}

function formatPlaces(places) {
  return places
    .map((place, index) => {
      const rating = place.rating ? `評価：${place.rating}` : "評価：不明";
      const count = Number.isFinite(place.userRatingCount) ? `口コミ数：${place.userRatingCount}件` : "口コミ数：不明";
      const mapUrl = place.googleMapsUri ? `\n地図：${place.googleMapsUri}` : "";
      return `${index + 1}. ${place.name}\n${place.address}\n${rating} / ${count}${mapUrl}`;
    })
    .join("\n\n");
}

function formatReviewMeta(review, place) {
  const googleSection = place?.placeId
    ? `\n\nGoogleで口コミを投稿する：\nhttps://search.google.com/local/writereview?placeid=${encodeURIComponent(place.placeId)}`
    : "";
  return `口コミ文を作成しました。上記の内容をコピーして投稿してください。

【投稿前チェック】
・実際の体験に基づいていますか？
・必要なら自分の言葉に直してください。${googleSection}`;
}

function formatAchievement({ totalCount, todayCount, monthCount }) {
  const nextGoal = Math.ceil(monthCount / 5) * 5 || 5;
  const remaining = Math.max(nextGoal - monthCount, 0);

  return `累計${totalCount || 0}件目の口コミ文作成です。
今日は${todayCount || 0}件、今月は${monthCount || 0}件です。
${remaining > 0 ? `あと${remaining}件で今月${nextGoal}件です。` : `今月${nextGoal}件に到達しました。`}

※これはGoogleへの投稿完了数ではなく、口コミ文の作成数です。`;
}

function paywallMessage({ quota, used, paymentUrl }) {
  const paymentLine = paymentUrl
    ? `\n\n口コミブースターはこちらから登録できます。\n${paymentUrl}`
    : "\n\n現在、決済リンクの準備が完了していません。管理者にお知らせください。";

  return `レビュー職人は、口コミブースター契約者向けの機能です。

現在の利用状況：${used || 0} / ${quota}件

口コミ文を作成するには、口コミブースターに登録してください。${paymentLine}`;
}

function friendlyError(error) {
  if (String(error?.message || "").includes("利用状況を確認できませんでした")) return error.message;
  if (String(error?.message || "").includes("API key")) return "APIキーの設定を確認してください。";
  if (String(error?.message || "").includes("not set")) return "必要な環境変数が未設定です。";
  return "処理に失敗しました。";
}
