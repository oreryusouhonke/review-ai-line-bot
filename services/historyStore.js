import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getSupabaseClient, isSupabaseConfigured } from "./supabaseClient.js";
import { getOrCreateUser } from "./userService.js";

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

export async function addReviewHistory(entry) {
  await addHistory(entry);

  if (!isSupabaseConfigured()) {
    return { savedToSupabase: false, source: "json" };
  }

  try {
    const lineUserId = entry.lineUserId || entry.userId;
    const user = await getOrCreateUser({ lineUserId });
    const supabase = getSupabaseClient();
    const { error } = await supabase.from("review_histories").insert({
      user_id: user?.id || null,
      line_user_id: lineUserId,
      place_id: entry.place?.placeId || entry.placeId || null,
      place_name: entry.place?.name || entry.placeName || null,
      place_address: entry.place?.address || entry.placeAddress || null,
      review_text: entry.review || entry.reviewText || null,
      memo: entry.experienceMemo || entry.memo || null,
    });

    if (error) throw error;
    return { savedToSupabase: true, source: "supabase" };
  } catch (error) {
    console.error("Supabase review history save failed:", safeSupabaseError(error));
    return { savedToSupabase: false, source: "json", error: true };
  }
}

export async function getUserReviewStats(lineUserId) {
  if (isSupabaseConfigured()) {
    try {
      const stats = await getSupabaseReviewStats(lineUserId);
      if (stats) return stats;
    } catch (error) {
      console.error("Supabase review stats read failed:", safeSupabaseError(error));
    }
  }

  return getJsonReviewStats(lineUserId);
}

async function getSupabaseReviewStats(lineUserId) {
  const supabase = getSupabaseClient();
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const nextMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();

  const totalResult = await supabase
    .from("review_histories")
    .select("id", { count: "exact", head: true })
    .eq("line_user_id", lineUserId);

  if (totalResult.error) throw totalResult.error;

  const monthResult = await supabase
    .from("review_histories")
    .select("id", { count: "exact", head: true })
    .eq("line_user_id", lineUserId)
    .gte("created_at", monthStart)
    .lt("created_at", nextMonthStart);

  if (monthResult.error) throw monthResult.error;

  return {
    totalCount: totalResult.count || 0,
    todayCount: 0,
    monthCount: monthResult.count || 0,
    source: "supabase",
  };
}

async function getJsonReviewStats(lineUserId) {
  const histories = await readHistories();
  const now = new Date();
  const todayKey = toDateKey(now);
  const monthKey = toMonthKey(now);
  const userCreates = histories.filter((entry) => entry.userId === lineUserId && entry.type === "create");

  return {
    totalCount: userCreates.length,
    todayCount: userCreates.filter((entry) => toDateKey(new Date(entry.createdAt)) === todayKey).length,
    monthCount: userCreates.filter((entry) => toMonthKey(new Date(entry.createdAt)) === monthKey).length,
    source: "json",
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

function safeSupabaseError(error) {
  return {
    message: error?.message,
    code: error?.code,
    details: error?.details,
    hint: error?.hint,
  };
}
