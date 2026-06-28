import { getSupabaseClient, isSupabaseConfigured } from "./supabaseClient.js";

export async function getOrCreateUser({ lineUserId, displayName = null } = {}) {
  if (!lineUserId) return null;
  if (!isSupabaseConfigured()) {
    return {
      id: null,
      line_user_id: lineUserId,
      display_name: displayName,
      source: "fallback",
    };
  }

  try {
    const supabase = getSupabaseClient();
    const { data: existing, error: findError } = await supabase
      .from("users")
      .select("*")
      .eq("line_user_id", lineUserId)
      .maybeSingle();

    if (findError) throw findError;
    if (existing) return existing;

    const { data: created, error: createError } = await supabase
      .from("users")
      .insert({
        line_user_id: lineUserId,
        display_name: displayName,
      })
      .select("*")
      .single();

    if (createError) throw createError;
    return created;
  } catch (error) {
    console.error("Supabase getOrCreateUser failed:", safeSupabaseError(error));
    return {
      id: null,
      line_user_id: lineUserId,
      display_name: displayName,
      source: "fallback",
      error: true,
    };
  }
}

export const findOrCreateUser = getOrCreateUser;

function safeSupabaseError(error) {
  return {
    message: error?.message,
    code: error?.code,
    details: error?.details,
    hint: error?.hint,
  };
}
