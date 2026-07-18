import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getSupabaseClient, isSupabaseConfigured } from "./supabaseClient.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../data");
const EVENT_PATH = path.join(DATA_DIR, "processed-webhook-events.json");
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

let jsonMutationQueue = Promise.resolve();
let lastSupabaseCleanupAt = 0;

export async function claimWebhookEvent(eventId) {
  if (!eventId) return true;

  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.from("processed_webhook_events").insert({ event_id: eventId });
      if (error?.code === "23505") return false;
      if (error) throw error;
      cleanupSupabaseEventsIfNeeded(supabase);
      await mirrorJsonClaim(eventId);
      return true;
    } catch (error) {
      console.error("Supabase webhook event claim failed:", safeSupabaseError(error));
    }
  }

  return claimJsonWebhookEvent(eventId);
}

async function mirrorJsonClaim(eventId) {
  try {
    await claimJsonWebhookEvent(eventId);
  } catch (error) {
    console.error("JSON webhook event mirror save failed:", error);
  }
}

export async function claimJsonWebhookEvent(eventId, filePath = EVENT_PATH) {
  return queueJsonMutation(async () => {
    const events = await readJsonEvents(filePath);
    purgeExpired(events);
    if (events[eventId]) return false;
    events[eventId] = new Date().toISOString();
    await writeJson(filePath, events);
    return true;
  });
}

function queueJsonMutation(operation) {
  const result = jsonMutationQueue.then(operation, operation);
  jsonMutationQueue = result.catch(() => {});
  return result;
}

async function readJsonEvents(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  try {
    const text = await fs.readFile(filePath, "utf8");
    return text.trim() ? JSON.parse(text) : {};
  } catch (error) {
    if (error?.code !== "ENOENT") console.error("Failed to read processed webhook events:", error);
    return {};
  }
}

function cleanupSupabaseEventsIfNeeded(supabase) {
  const now = Date.now();
  if (now - lastSupabaseCleanupAt < 60 * 60 * 1000) return;
  lastSupabaseCleanupAt = now;
  const cutoff = new Date(now - RETENTION_MS).toISOString();
  supabase
    .from("processed_webhook_events")
    .delete()
    .lt("processed_at", cutoff)
    .then(({ error }) => {
      if (error) console.warn("Supabase webhook event cleanup failed:", safeSupabaseError(error));
    });
}

function purgeExpired(events) {
  const cutoff = Date.now() - RETENTION_MS;
  for (const [eventId, processedAt] of Object.entries(events)) {
    if (Date.parse(processedAt) < cutoff) delete events[eventId];
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
