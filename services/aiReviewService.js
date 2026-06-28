import { GoogleGenerativeAI } from "@google/generative-ai";

export async function createReview({ place, experienceMemo }) {
  return generateReview({
    place,
    experienceMemo,
    instruction: "初回生成",
  });
}

export async function reviseReview({ place, experienceMemo, currentReview, revisionRequest }) {
  return generateReview({
    place,
    experienceMemo,
    currentReview,
    instruction: `修正依頼：${revisionRequest}`,
  });
}

async function generateReview({ place, experienceMemo, currentReview = "", instruction }) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set");
  }

  if (!experienceMemo || experienceMemo.length < 5) {
    throw new Error("体験メモが短すぎます");
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || "gemini-flash-lite-latest" });
  const prompt = buildPrompt({ place, experienceMemo, currentReview, instruction });
  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();

  return text.replace(/^["「]|["」]$/g, "").trim();
}

function buildPrompt({ place, experienceMemo, currentReview, instruction }) {
  return `
あなたはGoogle口コミ文の下書きを整えるAIです。
目的は、ユーザー本人の実体験メモを読みやすい口コミ文に整えることです。

店舗情報:
- 店名: ${place?.name || "不明"}
- 住所: ${place?.address || "不明"}

ユーザーの実体験メモ:
${experienceMemo}

現在の口コミ文:
${currentReview || "なし"}

今回の指示:
${instruction}

文章の長さと読みやすさ:
- 300文字前後を基準にする
- 目安は280〜360文字
- ただし、実体験メモが少ない場合は無理に嘘を足して300文字にしない
- 2〜4段落に分け、段落の間には空行を入れる
- 1文を長くしすぎず、読みやすいところで改行する
- 箇条書きではなく、投稿しやすい自然な口コミ本文にする

必ず守るルール:
- ユーザーの実体験メモだけを材料にする
- 事実を勝手に追加しない
- 実体験にない料理名、接客、価格、雰囲気、待ち時間、アクセス情報を追加しない
- 星評価や高評価を誘導しない
- 自動投稿を前提にしない
- 投稿前にユーザー本人が確認して直せる自然な日本語にする
- ネガティブな内容は攻撃的にせず、事実ベースで柔らかく表現する
- 宣伝文っぽくしない
- AIっぽい定型表現を避ける
- 入力不足の場合も、与えられた体験メモの範囲だけで口コミ本文を完成させる
- 出力は口コミ本文だけにする
`.trim();
}
