import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getSupabaseClient, isSupabaseConfigured } from "./supabaseClient.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../data");
const SESSION_PATH = path.join(DATA_DIR, "sessions.json");
const MAX_AGE_MS = 30 * 60 * 1000;

export async function ensureSessionStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await ensureJsonFile(SESSION_PATH, {});
}

export async function getSession(userId) {
  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("sessions")
        .select("session, updated_at")
        .eq("line_user_id", userId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;

      const updatedAt = Date.parse(data.session?.updatedAt || data.updated_at || 0);
      if (!updatedAt || Date.now() - updatedAt > MAX_AGE_MS) {
        await clearSupabaseSession(userId);
        return null;
      }
      return data.session;
    } catch (error) {
      console.error("Supabase session read failed:", safeSupabaseError(error));
    }
  }

  return getJsonSession(userId);
}

async function getJsonSession(userId) {
  const sessions = await readSessions();
  await purgeExpired(sessions);
  return sessions[userId] || null;
}

export async function saveSession(userId, session) {
  const storedSession = {
    ...session,
    updatedAt: session.updatedAt || new Date().toISOString(),
  };
  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.from("sessions").upsert({
        line_user_id: userId,
        session: storedSession,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      try {
        await saveJsonSession(userId, storedSession);
      } catch (error) {
        console.error("JSON session mirror save failed:", error);
      }
      return;
    } catch (error) {
      console.error("Supabase session save failed:", safeSupabaseError(error));
    }
  }

  await saveJsonSession(userId, storedSession);
}

export async function clearSession(userId) {
  if (isSupabaseConfigured()) {
    try {
      await clearSupabaseSession(userId);
      try {
        await clearJsonSession(userId);
      } catch (error) {
        console.error("JSON session mirror delete failed:", error);
      }
      return;
    } catch (error) {
      console.error("Supabase session delete failed:", safeSupabaseError(error));
    }
  }

  await clearJsonSession(userId);
}

export async function setGenerating(userId, generating) {
  const session = await getSession(userId);
  if (!session) return;
  await saveSession(userId, {
    ...session,
    generating,
    updatedAt: new Date().toISOString(),
  });
}

async function clearSupabaseSession(userId) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("sessions").delete().eq("line_user_id", userId);
  if (error) throw error;
}

async function saveJsonSession(userId, session) {
  const sessions = await readSessions();
  sessions[userId] = session;
  await writeJson(SESSION_PATH, sessions);
}

async function clearJsonSession(userId) {
  const sessions = await readSessions();
  delete sessions[userId];
  await writeJson(SESSION_PATH, sessions);
}

async function readSessions() {
  await ensureSessionStore();
  try {
    const text = await fs.readFile(SESSION_PATH, "utf8");
    return text.trim() ? JSON.parse(text) : {};
  } catch (error) {
    console.error("Failed to read sessions.json:", error);
    return {};
  }
}

async function purgeExpired(sessions) {
  const now = Date.now();
  let changed = false;
  for (const [userId, session] of Object.entries(sessions)) {
    const updatedAt = Date.parse(session.updatedAt || 0);
    if (!updatedAt || now - updatedAt > MAX_AGE_MS) {
      delete sessions[userId];
      changed = true;
    }
  }
  if (changed) await writeJson(SESSION_PATH, sessions);
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

function safeSupabaseError(error) {
  return {
    message: error?.message,
    code: error?.code,
    details: error?.details,
    hint: error?.hint,
  };
}
