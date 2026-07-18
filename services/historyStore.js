import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getSupabaseClient, isSupabaseConfigured } from "./supabaseClient.js";
import { getOrCreateUser } from "./userService.js";
import { getJstDayRange, getJstMonthRange } from "./jstDateRange.js";

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
  if (!isSupabaseConfigured()) {
    await addHistory(entry);
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
      type: entry.type || "create",
      category_code: entry.place?.categoryCode || entry.categoryCode || "other",
      category_label: entry.place?.categoryLabel || entry.categoryLabel || "その他",
    });

    if (error) throw error;
    try {
      await addHistory(entry);
    } catch (jsonError) {
      console.error("JSON review history mirror save failed:", jsonError);
    }
    return { savedToSupabase: true, source: "supabase" };
  } catch (error) {
    console.error("Supabase review history save failed:", safeSupabaseError(error));
    await addHistory(entry);
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

export async function getMonthlyRanking({ lineUserId, limit = 10 } = {}) {
  if (isSupabaseConfigured()) {
    try {
      return await getSupabaseMonthlyRanking({ lineUserId, limit });
    } catch (error) {
      console.error("Supabase monthly ranking read failed:", safeSupabaseError(error));
    }
  }

  return getJsonMonthlyRanking({ lineUserId, limit });
}

async function getSupabaseReviewStats(lineUserId) {
  const supabase = getSupabaseClient();
  const { monthStart, nextMonthStart } = getJstMonthRange();
  const { dayStart, nextDayStart } = getJstDayRange();

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

  const todayResult = await supabase
    .from("review_histories")
    .select("id", { count: "exact", head: true })
    .eq("line_user_id", lineUserId)
    .gte("created_at", dayStart)
    .lt("created_at", nextDayStart);
  if (todayResult.error) throw todayResult.error;

  const categoryResult = await supabase
    .from("review_histories")
    .select("category_code")
    .eq("line_user_id", lineUserId);
  if (categoryResult.error) throw categoryResult.error;

  return {
    totalCount: totalResult.count || 0,
    todayCount: todayResult.count || 0,
    monthCount: monthResult.count || 0,
    categoryCounts: countCategories(categoryResult.data || []),
    source: "supabase",
  };
}

async function getSupabaseMonthlyRanking({ lineUserId, limit }) {
  const supabase = getSupabaseClient();
  const { monthStart, nextMonthStart } = getJstMonthRange();
  const { data, error } = await supabase
    .from("review_histories")
    .select("line_user_id, users(nickname, public_display_name, display_name, ranking_enabled)")
    .gte("created_at", monthStart)
    .lt("created_at", nextMonthStart);

  if (error) throw error;
  return buildRankingFromRows(data || [], { lineUserId, limit, source: "supabase" });
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
    categoryCounts: countCategories(userCreates.map((entry) => ({ category_code: entry.place?.categoryCode || "other" }))),
    source: "json",
  };
}

async function getJsonMonthlyRanking({ lineUserId, limit }) {
  const histories = await readHistories();
  const monthKey = toMonthKey(new Date());
  const rows = histories
    .filter((entry) => entry.type === "create" && toMonthKey(new Date(entry.createdAt)) === monthKey)
    .map((entry) => ({ line_user_id: entry.userId, users: null }));
  return buildRankingFromRows(rows, { lineUserId, limit, source: "json" });
}

function buildRankingFromRows(rows, { lineUserId, limit, source }) {
  const grouped = new Map();
  for (const row of rows) {
    const id = row.line_user_id;
    if (!id) continue;
    const current = grouped.get(id) || {
      lineUserId: id,
      count: 0,
      displayName: fallbackDisplayName(id),
    };
    current.count += 1;
    current.displayName = displayNameForRanking(row.users, id);
    grouped.set(id, current);
  }

  const all = [...grouped.values()]
    .sort((a, b) => b.count - a.count || a.displayName.localeCompare(b.displayName))
    .map((item, index) => ({ ...item, rank: index + 1 }));

  const userRank = all.find((item) => item.lineUserId === lineUserId) || {
    lineUserId,
    displayName: fallbackDisplayName(lineUserId || ""),
    count: 0,
    rank: all.length + 1,
  };

  return {
    top: all.slice(0, limit),
    userRank,
    source,
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

function countCategories(rows) {
  return rows.reduce((acc, row) => {
    const code = row.category_code || "other";
    acc[code] = (acc[code] || 0) + 1;
    return acc;
  }, {});
}

function displayNameForRanking(user, lineUserId) {
  if (!user?.ranking_enabled) return fallbackDisplayName(lineUserId);
  return user?.nickname || user?.public_display_name || fallbackDisplayName(lineUserId);
}

function fallbackDisplayName(lineUserId) {
  const suffix = String(lineUserId || "0000").slice(-4).padStart(4, "0");
  return `レビュー職人${suffix}`;
}

function safeSupabaseError(error) {
  return {
    message: error?.message,
    code: error?.code,
    details: error?.details,
    hint: error?.hint,
  };
}
