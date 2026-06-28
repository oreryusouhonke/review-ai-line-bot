import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../data");
const HISTORY_PATH = path.join(DATA_DIR, "histories.json");

export async function ensureHistoryStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await ensureJsonFile(HISTORY_PATH, []);
}

export async function addHistory(entry) {
  const histories = await readHistories();
  histories.push({
    ...entry,
    createdAt: new Date().toISOString(),
  });
  await writeJson(HISTORY_PATH, histories);
}

export async function getUserReviewStats(userId) {
  const histories = await readHistories();
  const now = new Date();
  const todayKey = toDateKey(now);
  const monthKey = toMonthKey(now);
  const userCreates = histories.filter((entry) => entry.userId === userId && entry.type === "create");

  return {
    todayCount: userCreates.filter((entry) => toDateKey(new Date(entry.createdAt)) === todayKey).length,
    monthCount: userCreates.filter((entry) => toMonthKey(new Date(entry.createdAt)) === monthKey).length,
  };
}

async function readHistories() {
  await ensureHistoryStore();
  try {
    const text = await fs.readFile(HISTORY_PATH, "utf8");
    return text.trim() ? JSON.parse(text) : [];
  } catch (error) {
    console.error("Failed to read histories.json:", error);
    return [];
  }
}

async function ensureJsonFile(filePath, fallback) {
  try {
    await fs.access(filePath);
  } catch {
    await writeJson(filePath, fallback);
  }
}

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function toDateKey(date) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function toMonthKey(date) {
  return toDateKey(date).slice(0, 7);
}
