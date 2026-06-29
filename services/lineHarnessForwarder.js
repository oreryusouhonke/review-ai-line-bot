const DEFAULT_TIMEOUT_MS = 3000;

export function getLineHarnessWebhookUrl() {
  const explicitUrl = normalizeUrl(process.env.LINE_HARNESS_WEBHOOK_URL);
  if (explicitUrl) return explicitUrl;

  const baseUrl = normalizeUrl(process.env.LINE_HARNESS_BASE_URL);
  if (!baseUrl) return "";

  return `${baseUrl.replace(/\/+$/, "")}/webhook`;
}

export function isLineHarnessForwardingConfigured() {
  return Boolean(getLineHarnessWebhookUrl());
}

export async function forwardLineWebhookToHarness({ rawBody, signature }) {
  const webhookUrl = getLineHarnessWebhookUrl();
  if (!webhookUrl) return { skipped: true, reason: "not_configured" };

  if (!rawBody || !signature) {
    return { skipped: true, reason: "missing_body_or_signature" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Line-Signature": signature,
      },
      body: rawBody,
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await safeReadText(response);
      console.error("LINE Harness webhook forwarding failed:", {
        status: response.status,
        bodyPreview: text.slice(0, 200),
      });
      return { ok: false, status: response.status };
    }

    console.log("LINE Harness webhook forwarded:", {
      status: response.status,
    });
    return { ok: true, status: response.status };
  } catch (error) {
    console.error("LINE Harness webhook forwarding error:", {
      name: error?.name,
      message: error?.message,
    });
    return { ok: false, error };
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text;
}

async function safeReadText(response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}
