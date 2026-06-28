import { Client } from "@line/bot-sdk";
import { createReview, reviseReview } from "./aiReviewService.js";
import { addHistory, addReviewHistory, getUserReviewStats } from "./historyStore.js";
import { buildBadgesMessage } from "./badgeService.js";
import { buildFavoritesMessage } from "./favoriteService.js";
import { buildMyPageMessage } from "./myPageService.js";
import { buildRankingMessage } from "./rankingService.js";
import { searchPlaces } from "./placesService.js";
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
    await reply(replyToken, await buildMyPageMessage(userId));
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
    await reply(replyToken, await buildBadgesMessage(userId));
    return;
  }

  if (command === "help") {
    await reply(replyToken, helpMessage());
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

  await reply(replyToken, `候補が見つかりました。\n番号で選んでください。\n\n${formatPlaces(places)}`);
}

async function handlePlaceSelection(userId, replyToken, text, session) {
  const index = Number(toHalfWidthNumber(text)) - 1;
  const candidates = Array.isArray(session.candidates) ? session.candidates : [];
  const selectedPlace = candidates[index];

  if (!selectedPlace) {
    await reply(replyToken, "候補の番号を 1 から 5 の数字で送ってください。");
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

  await setGenerating(userId, true);
  await reply(replyToken, "3つの回答をもとに口コミ文を作成しています。完成したらこのトークに送ります。");

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

    const stats = await getUserReviewStats(userId);
    await pushReviewMessages(userId, review, session.selectedPlace, stats);
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

  await setGenerating(userId, true);
  await reply(replyToken, "口コミ文を修正しています。完成したらこのトークに送ります。");

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

    await pushReviewMessages(userId, review, session.selectedPlace);
  } catch (error) {
    console.error("review revision failed:", error);
    await setGenerating(userId, false);
    await push(userId, `エラーが発生しました。\n${friendlyError(error)}\n\n「リセット」と送ると最初からやり直せます。`);
  }
}

async function reply(replyToken, text) {
  if (!process.env.LINE_CHANNEL_ACCESS_TOKEN) {
    throw new Error("LINE_CHANNEL_ACCESS_TOKEN is not set");
  }

  const client = new Client({
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  });
  await client.replyMessage(replyToken, { type: "text", text });
}

async function push(userId, text) {
  if (!process.env.LINE_CHANNEL_ACCESS_TOKEN) {
    throw new Error("LINE_CHANNEL_ACCESS_TOKEN is not set");
  }

  const client = new Client({
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  });
  await client.pushMessage(userId, { type: "text", text });
}

async function pushReviewMessages(userId, review, place, stats = null) {
  await push(userId, formatCopyOnlyReview(review));
  await push(userId, stats
    ? `${formatReviewMeta(review, place)}\n\n${formatAchievement(stats)}`
    : formatReviewMeta(review, place));
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

function startMessage() {
  return `レビューAIです。\n店名と地域を送ってください。\n\n例：\n匝瑳市 ブリッジ\n銀座 タイムリッチ\n茂原 福わ家`;
}

function helpMessage() {
  return `レビュー職人｜口コミ半自動化AIです。

できること：
Google口コミ用の文章を、あなたの実体験メモから作ります。

使い方：
1. 「開始」と送る
2. 店名と地域を送る
3. 候補番号を選ぶ
4. 3つの質問に答える
5. 必要なら「修正：もっと自然に」と送る

コマンド：
マイページ / 履歴 / ランキング / お気に入り / バッジ / ヘルプ / リセット

自動投稿はしません。投稿前に必ずご本人が確認してください。`;
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

function formatCopyOnlyReview(review) {
  return `【コピー用口コミ文】
このメッセージだけをコピーしてください。

${review}`;
}

function formatReviewMeta(review, place) {
  const url = `https://search.google.com/local/writereview?placeid=${encodeURIComponent(place.placeId)}`;
  return `口コミ文を作成しました。

文字数：${review.length}文字

【投稿前チェック】
・実際の体験に基づいていますか？
・内容に間違いはありませんか？
・必要なら自分の言葉に直してください。

Googleで口コミを投稿する：
${url}

修正したい場合は
修正：もっとカジュアルに
のように送ってください。`;
}

function formatAchievement({ totalCount, todayCount, monthCount }) {
  const nextGoal = Math.ceil(monthCount / 5) * 5 || 5;
  const remaining = Math.max(nextGoal - monthCount, 0);

  return `累計${totalCount || 0}件目の口コミ文作成です。
今日は${todayCount || 0}件、今月は${monthCount || 0}件です。
${remaining > 0 ? `あと${remaining}件で今月${nextGoal}件です。` : `今月${nextGoal}件に到達しました。`}

※これはGoogleへの投稿完了数ではなく、口コミ文の作成数です。`;
}

function friendlyError(error) {
  if (String(error?.message || "").includes("API key")) return "APIキーの設定を確認してください。";
  if (String(error?.message || "").includes("not set")) return "必要な環境変数が未設定です。";
  return "処理に失敗しました。";
}
