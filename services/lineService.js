import { Client } from "@line/bot-sdk";
import { createReview, reviseReview } from "./aiReviewService.js";
import { addHistory, getUserReviewStats } from "./historyStore.js";
import { buildMyPageMessage } from "./myPageService.js";
import { searchPlaces } from "./placesService.js";
import {
  clearSession,
  getSession,
  saveSession,
  setGenerating,
} from "./sessionStore.js";

const RESET_COMMANDS = new Set(["開始", "やり直し", "キャンセル", "リセット"]);

export async function handleTextMessage(event) {
  const userId = event.source?.userId;
  const replyToken = event.replyToken;
  const text = normalize(event.message.text);

  if (!userId || !replyToken) return;

  if (text === "ヘルプ") {
    await reply(replyToken, helpMessage());
    return;
  }

  if (text === "マイページ") {
    await reply(replyToken, await buildMyPageMessage(userId));
    return;
  }

  if (RESET_COMMANDS.has(text)) {
    await clearSession(userId);
    await saveSession(userId, {
      step: "awaiting_place_query",
      updatedAt: new Date().toISOString(),
    });
    await reply(replyToken, startMessage());
    return;
  }

  const session = await getSession(userId);

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

  try {
    if (session.step === "awaiting_place_query") {
      await handlePlaceQuery(userId, replyToken, text);
      return;
    }

    if (session.step === "awaiting_place_selection") {
      await handlePlaceSelection(userId, replyToken, text, session);
      return;
    }

    if (session.step === "awaiting_experience") {
      await handleExperience(userId, replyToken, text, session);
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
    step: "awaiting_experience",
    selectedPlace,
    updatedAt: new Date().toISOString(),
  });

  await reply(
    replyToken,
    `「${selectedPlace.name}」ですね。\n体験内容を送ってください。\n\n例：\nハンバーグがおいしかった。\n味噌汁が具沢山。\nボリュームが多くて満足。`
  );
}

async function handleExperience(userId, replyToken, text, session) {
  await setGenerating(userId, true);
  await reply(replyToken, "口コミ文を作成しています。完成したらこのトークに送ります。");

  try {
    const review = await createReview({
      place: session.selectedPlace,
      experienceMemo: text,
    });

    const nextSession = {
      ...session,
      step: "completed",
      experienceMemo: text,
      lastReview: review,
      generating: false,
      updatedAt: new Date().toISOString(),
    };

    await saveSession(userId, nextSession);
    await addHistory({
      userId,
      place: session.selectedPlace,
      experienceMemo: text,
      review,
      type: "create",
    });

    const stats = await getUserReviewStats(userId);
    await push(userId, `${formatReviewResult(review, session.selectedPlace)}\n\n${formatAchievement(stats)}`);
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

    await push(userId, formatReviewResult(review, session.selectedPlace));
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

function normalize(text) {
  return String(text || "").trim();
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
  return `レビューAI公式LINE Botです。\n\nできること：\nGoogle口コミ用の文章を、あなたの実体験メモから作ります。\n\n使い方：\n1. 「開始」と送る\n2. 店名と地域を送る\n3. 候補番号を選ぶ\n4. 体験メモを送る\n5. 必要なら「修正：もっと自然に」と送る\n\nコマンド：\nマイページ / リセット\n\n自動投稿はしません。投稿前に必ずご本人が確認してください。`;
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

function formatReviewResult(review, place) {
  const url = `https://search.google.com/local/writereview?placeid=${encodeURIComponent(place.placeId)}`;
  return `以下の口コミ文を作成しました。\n\n【コピー用】\n${review}\n\n文字数：${review.length}文字\n\n【投稿前チェック】\n・実際の体験に基づいていますか？\n・内容に間違いはありませんか？\n・必要なら自分の言葉に直してください。\n\nGoogleで口コミを投稿する：\n${url}\n\n修正したい場合は\n修正：もっとカジュアルに\nのように送ってください。`;
}

function formatAchievement({ todayCount, monthCount }) {
  const nextGoal = Math.ceil(monthCount / 5) * 5 || 5;
  const remaining = Math.max(nextGoal - monthCount, 0);
  const title = monthCount >= 10 ? "レビュー達人" : monthCount >= 5 ? "レビュー名人" : "レビュー見習い";

  if (remaining === 0) {
    return `今日は${todayCount}件目の口コミでした。\n今月${monthCount}件目の口コミです。\n${title}に到達しました。`;
  }

  return `今日は${todayCount}件目の口コミでした。\n今月${monthCount}件目の口コミです。\nあと${remaining}件で${nextGoal}件達成です。`;
}

function friendlyError(error) {
  if (String(error?.message || "").includes("API key")) return "APIキーの設定を確認してください。";
  if (String(error?.message || "").includes("not set")) return "必要な環境変数が未設定です。";
  return "処理に失敗しました。";
}
