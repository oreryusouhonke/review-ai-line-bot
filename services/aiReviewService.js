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
あなたはGoogle口コミ文の作成支援AIです。
目的は、ユーザー本人の実体験メモを読みやすい口コミ文に整えることです。

店舗情報:
- 店名: ${place?.name || "不明"}
- 住所: ${place?.address || "不明"}

ユーザーの体験メモ:
${experienceMemo}

現在の口コミ文:
${currentReview || "なし"}

今回の指示:
${instruction}

必ず守るルール:
- ユーザーの体験メモだけを材料にする
- 事実を勝手に追加しない
- Google口コミ向けに200文字以上
- 自然な日本語
- 過剰に褒めすぎない
- 星評価を誘導しない
- 「また行きたい」は、ユーザーがそう書いた場合のみ使う
- ネガティブ内容は攻撃的にせず、事実ベースで柔らかく表現する
- 出力は口コミ本文だけにする
- 宣伝文っぽくしない
- AIっぽい定型文を避ける
- 実体験にない料理名、接客、価格、雰囲気、待ち時間、アクセス情報を追加しない
- 入力不足の案内や質問は返さず、与えられた体験メモの範囲だけで口コミ本文を完成させる
- 体験メモが短い場合も、同じ事実を自然に言い換えて200文字以上に整える
`.trim();
}
