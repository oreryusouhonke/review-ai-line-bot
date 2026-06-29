import { getNewMilestoneTags } from "./rankService.js";
import { markMilestoneTagSynced, parseSyncedTags } from "./userService.js";

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_TAG_COLOR = "#06C755";
const DEFAULT_LOOKUP_LIMIT = 1000;

export const REVIEW_CREATED_TAG = "\u53e3\u30b3\u30df\u4f5c\u6210_\u5b8c\u4e86";
export const REVIEW_DRAFT_CREATED_TAG = "\u53e3\u30b3\u30df\u4e0b\u66f8\u304d\u751f\u6210\u6e08\u307f";
export const GOOGLE_POST_GUIDE_SENT_TAG = "Google\u6295\u7a3f\u6848\u5185\u6e08\u307f";

export function getLineHarnessBaseUrl() {
  const explicitBase = normalizeUrl(process.env.LINE_HARNESS_BASE_URL);
  if (explicitBase) return explicitBase.replace(/\/+$/, "");

  const webhookUrl = normalizeUrl(process.env.LINE_HARNESS_WEBHOOK_URL);
  if (!webhookUrl) return "";

  return webhookUrl.replace(/\/webhook\/?$/, "").replace(/\/+$/, "");
}

export function isLineHarnessTaggingConfigured() {
  return Boolean(getLineHarnessBaseUrl() && normalizeUrl(process.env.LINE_HARNESS_API_KEY));
}

export function tagReviewCreatedInHarness(lineUserId) {
  if (!isLineHarnessTaggingConfigured()) {
    return;
  }

  const tags = [
    REVIEW_CREATED_TAG,
    REVIEW_DRAFT_CREATED_TAG,
    GOOGLE_POST_GUIDE_SENT_TAG,
  ];

  for (const tagName of tags) {
    addTagToHarness(lineUserId, tagName).catch((error) => {
      console.warn("LINE Harness tag attach task failed:", {
        tagName,
        hasLineUserId: Boolean(lineUserId),
        message: error?.message,
      });
    });
  }
}

export function syncReviewMilestonesToHarness(lineUserId, userRecord) {
  if (!isLineHarnessTaggingConfigured() || !userRecord) {
    return;
  }

  const reviewCount = userRecord.review_count || 0;
  const syncedTags = parseSyncedTags(userRecord.milestone_tags_synced);
  const tagNames = getNewMilestoneTags(reviewCount, syncedTags);

  for (const tagName of tagNames) {
    addTagToHarness(lineUserId, tagName)
      .then((result) => {
        if (result?.ok) {
          return markMilestoneTagSynced(lineUserId, tagName);
        }
        return null;
      })
      .catch((error) => {
        console.warn("LINE Harness milestone tag sync failed:", {
          tagName,
          reviewCount,
          hasLineUserId: Boolean(lineUserId),
          message: error?.message,
        });
      });
  }
}

export async function addTagToHarness(lineUserId, tagName) {
  const cleanLineUserId = normalizeUrl(lineUserId);
  const cleanTagName = normalizeUrl(tagName);
  if (!cleanLineUserId || !cleanTagName) {
    return { skipped: true, reason: "missing_line_user_id_or_tag_name" };
  }

  if (!isLineHarnessTaggingConfigured()) {
    return { skipped: true, reason: "not_configured" };
  }

  try {
    const tag = await ensureHarnessTag(cleanTagName);
    const friend = await findHarnessFriendByLineUserId(cleanLineUserId);

    if (!friend) {
      console.warn("LINE Harness friend not found for tag attach:", {
        tagName: cleanTagName,
        hasLineUserId: Boolean(cleanLineUserId),
      });
      return { ok: false, reason: "friend_not_found" };
    }

    await harnessFetch(`/api/friends/${encodeURIComponent(friend.id)}/tags`, {
      method: "POST",
      body: JSON.stringify({ tagId: tag.id }),
    });

    console.log("LINE Harness tag attached:", {
      tagName: cleanTagName,
      friendId: friend.id,
    });
    return { ok: true, friendId: friend.id, tagId: tag.id };
  } catch (error) {
    console.warn("LINE Harness tag attach failed:", {
      tagName: cleanTagName,
      hasLineUserId: Boolean(cleanLineUserId),
      message: error?.message,
    });
    return { ok: false, error: true };
  }
}

async function ensureHarnessTag(tagName) {
  const tagsResponse = await harnessFetch("/api/tags");
  const tags = Array.isArray(tagsResponse?.data) ? tagsResponse.data : [];
  const existing = tags.find((tag) => tag?.name === tagName);
  if (existing?.id) return existing;

  const created = await harnessFetch("/api/tags", {
    method: "POST",
    body: JSON.stringify({ name: tagName, color: DEFAULT_TAG_COLOR }),
  });

  if (!created?.data?.id) {
    throw new Error(`LINE Harness tag create failed: ${tagName}`);
  }
  return created.data;
}

async function findHarnessFriendByLineUserId(lineUserId) {
  const limit = Number(process.env.LINE_HARNESS_FRIEND_LOOKUP_LIMIT || DEFAULT_LOOKUP_LIMIT);
  const response = await harnessFetch(`/api/friends?limit=${encodeURIComponent(String(limit))}&includeTags=false`);
  const friends = Array.isArray(response?.data?.items)
    ? response.data.items
    : Array.isArray(response?.data)
      ? response.data
      : [];
  return friends.find((friend) => friend?.lineUserId === lineUserId) || null;
}

async function harnessFetch(path, options = {}) {
  const baseUrl = getLineHarnessBaseUrl();
  const apiKey = normalizeUrl(process.env.LINE_HARNESS_API_KEY);
  if (!baseUrl || !apiKey) {
    throw new Error("LINE Harness tagging is not configured");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method || "GET",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      body: options.body,
      signal: controller.signal,
    });

    const text = await safeReadText(response);
    const json = text ? safeJsonParse(text) : null;

    if (!response.ok) {
      throw new Error(`LINE Harness API error ${response.status}: ${text.slice(0, 200)}`);
    }
    return json;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeUrl(value) {
  return String(value || "").trim();
}

async function safeReadText(response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
