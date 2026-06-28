import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../data");
const SESSION_PATH = path.join(DATA_DIR, "sessions.json");
const MAX_AGE_MS = 30 * 60 * 1000;

export async function ensureSessionStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await ensureJsonFile(SESSION_PATH, {});
}

export async function getSession(userId) {
  const sessions = await readSessions();
  await purgeExpired(sessions);
  return sessions[userId] || null;
}

export async function saveSession(userId, session) {
  const sessions = await readSessions();
  sessions[userId] = {
    ...session,
    updatedAt: session.updatedAt || new Date().toISOString(),
  };
  await writeJson(SESSION_PATH, sessions);
}

export async function clearSession(userId) {
  const sessions = await readSessions();
  delete sessions[userId];
  await writeJson(SESSION_PATH, sessions);
}

export async function setGenerating(userId, generating) {
  const sessions = await readSessions();
  if (!sessions[userId]) return;
  sessions[userId].generating = generating;
  sessions[userId].updatedAt = new Date().toISOString();
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
