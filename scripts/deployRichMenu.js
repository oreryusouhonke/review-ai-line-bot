import fs from "node:fs";
import "dotenv/config";

const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
if (!token) throw new Error("LINE_CHANNEL_ACCESS_TOKEN is missing");

const auth = { Authorization: `Bearer ${token}` };
const menu = {
  size: { width: 2500, height: 843 },
  selected: true,
  name: "メインメニューv3（4列）",
  chatBarText: "メニュー",
  areas: [
    { bounds: { x: 0, y: 0, width: 625, height: 843 }, action: { type: "message", label: "開始", text: "開始" } },
    { bounds: { x: 625, y: 0, width: 625, height: 843 }, action: { type: "uri", label: "募集店", uri: "https://kuchikomi-booster.vercel.app/boshu" } },
    { bounds: { x: 1250, y: 0, width: 625, height: 843 }, action: { type: "message", label: "マイページ", text: "マイページ" } },
    { bounds: { x: 1875, y: 0, width: 625, height: 843 }, action: { type: "message", label: "使い方", text: "使い方" } },
  ],
};

async function checked(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${url}: ${body}`);
  return body ? JSON.parse(body) : null;
}

const created = await checked("https://api.line.me/v2/bot/richmenu", {
  method: "POST",
  headers: { ...auth, "Content-Type": "application/json" },
  body: JSON.stringify(menu),
});
const richMenuId = created.richMenuId;

try {
  await checked(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "image/png" },
    body: fs.readFileSync("assets/rich-menu-4-columns.png"),
  });
  await checked(`https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`, {
    method: "POST",
    headers: auth,
  });
  const current = await checked("https://api.line.me/v2/bot/user/all/richmenu", { headers: auth });
  const detail = await checked(`https://api.line.me/v2/bot/richmenu/${richMenuId}`, { headers: auth });
  console.log(JSON.stringify({
    createdRichMenuId: richMenuId,
    defaultRichMenuId: current.richMenuId,
    name: detail.name,
    size: detail.size,
    areas: detail.areas.length,
  }, null, 2));
} catch (error) {
  console.error(`Rich menu ${richMenuId} was created but not activated.`);
  throw error;
}
