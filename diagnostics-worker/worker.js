/**
 * Listening Room - Serverless Diagnostics & Crash Proxy (Cloudflare Worker)
 * 
 * Secure gateway between the Listening Room desktop client and Discord.
 * - Keeps the Discord Webhook URL secret (stored in Worker encrypted environment secrets).
 * - Validates incoming diagnostic payloads (<64KB).
 * - Redacts sensitive tokens (Spotify secrets, auth tokens) and user directory paths.
 * - Implements in-memory rate limiting and crash deduplication to prevent crash storms.
 * - Formats high-fidelity Discord rich embeds with color-coded severity.
 */

// In-memory sliding window cache for rate limiting & deduplication
const ipRateLimitMap = new Map();
const errorDedupMap = new Map();

const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_IP = 10;
const DEDUP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

// CORS headers for preflight requests
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-App-Version, X-Report-Source",
};

/**
 * Sanitizes strings by redacting paths and potential tokens
 */
function sanitizeText(text) {
  if (!text || typeof text !== "string") return "";
  return text
    // Redact Windows user paths: C:\Users\Username\... -> C:\Users\<user>\...
    .replace(/([a-zA-Z]:\\Users\\)[^\\]+(\\)/gi, "$1<user>$2")
    // Redact Unix home paths: /home/username/... -> /home/<user>/...
    .replace(/(\/home\/)[^\/]+(\/)/gi, "$1<user>$2")
    // Redact macOS user paths: /Users/username/... -> /Users/<user>/...
    .replace(/(\/Users\/)[^\/]+(\/)/gi, "$1<user>$2")
    // Redact Spotify Bearer / access tokens
    .replace(/BQA[a-zA-Z0-9_-]{40,}/g, "[REDACTED_SPOTIFY_TOKEN]")
    .replace(/bearer\s+[a-zA-Z0-9_\-\.]{20,}/gi, "Bearer [REDACTED_TOKEN]");
}

/**
 * Creates a unique fingerprint string for deduplicating identical crashes
 */
function getErrorFingerprint(payload) {
  const version = payload.version || "unknown";
  const source = payload.source || "unknown";
  const location = payload.error_location || "";
  const msgPrefix = (payload.error_message || "").slice(0, 100);
  return `${version}::${source}::${location}::${msgPrefix}`;
}

/**
 * Cleans up expired cache entries periodically
 */
function pruneCaches() {
  const now = Date.now();
  for (const [ip, data] of ipRateLimitMap.entries()) {
    if (now - data.resetTime > RATE_LIMIT_WINDOW_MS) {
      ipRateLimitMap.delete(ip);
    }
  }
  for (const [key, timestamp] of errorDedupMap.entries()) {
    if (now - timestamp > DEDUP_WINDOW_MS) {
      errorDedupMap.delete(key);
    }
  }
}

export default {
  async fetch(request, env, ctx) {
    // 1. Handle CORS Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // 2. Only allow POST requests
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed. Use POST." }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(request.url);

    // 3. Verify that the DISCORD_WEBHOOK_URL secret is configured
    if (!env.DISCORD_WEBHOOK_URL) {
      return new Response(
        JSON.stringify({
          error: "Cloudflare Worker configuration missing: DISCORD_WEBHOOK_URL secret is not set.",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Rate limiting by Client IP
    const clientIp = request.headers.get("CF-Connecting-IP") || "anonymous";
    const now = Date.now();
    pruneCaches();

    const ipData = ipRateLimitMap.get(clientIp) || { count: 0, resetTime: now };
    if (now - ipData.resetTime > RATE_LIMIT_WINDOW_MS) {
      ipData.count = 1;
      ipData.resetTime = now;
    } else {
      ipData.count++;
    }
    ipRateLimitMap.set(clientIp, ipData);

    if (ipData.count > MAX_REQUESTS_PER_IP) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded. Please wait a minute before submitting again." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Payload size check (<64KB)
    const contentLength = parseInt(request.headers.get("Content-Length") || "0", 10);
    if (contentLength > 65536) {
      return new Response(JSON.stringify({ error: "Payload exceeds 64KB limit." }), {
        status: 413,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 6. Parse JSON Payload
    let payload;
    try {
      payload = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON format in request body." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const source = payload.source || "manual-report";
    const isTestCrash = source === "test-crash" || (payload.error_message && payload.error_message.toLowerCase().includes("test crash"));
    const isTest = source === "test-ping" || isTestCrash || url.pathname.endsWith("/test");

    // 7. Deduplicate identical crashes within 5 minutes (except for test pings & test crashes)
    if (!isTest) {
      const fingerprint = getErrorFingerprint(payload);
      const lastSeen = errorDedupMap.get(fingerprint);
      if (lastSeen && now - lastSeen < DEDUP_WINDOW_MS) {
        return new Response(
          JSON.stringify({ status: "deduplicated", message: "Identical crash report already received recently." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      errorDedupMap.set(fingerprint, now);
    }

    // 8. Sanitize fields
    const sanitizedMsg = sanitizeText(payload.error_message || "No error message provided");
    const sanitizedLocation = sanitizeText(payload.error_location || "");
    const sanitizedStack = sanitizeText(payload.stack_trace || "");
    const sanitizedUserNote = sanitizeText(payload.user_note || "");
    const version = payload.version || "unknown";
    const platform = payload.platform || "unknown";
    const arch = payload.arch || "unknown";
    const osVersion = payload.os_version || platform;

    // 9. Format Discord Embed
    let embedColor = 0x3498db; // Blue default
    let embedTitle = "📝 Listening Room Diagnostic Report";

    if (source === "test-ping" || url.pathname.endsWith("/test")) {
      embedColor = 0x2ecc71; // Green
      embedTitle = "✅ Diagnostic Webhook Test Successful";
    } else if (isTestCrash) {
      embedColor = 0xe74c3c; // Red
      embedTitle = "🧪 Simulated Crash Verified: Rust Panic (Test)";
    } else if (source === "rust-panic" || source === "rust-crash-log") {
      embedColor = 0xe74c3c; // Red
      embedTitle = "🚨 Fatal Crash Report: Rust Panic";
    } else if (source === "frontend-error" || source === "react-error-boundary") {
      embedColor = 0xe67e22; // Orange
      embedTitle = "⚠️ UI Runtime Exception: React Crash";
    }

    const fields = [
      { name: "App Version", value: `\`v${version}\``, inline: true },
      { name: "Platform", value: `\`${platform} (${arch})\``, inline: true },
      { name: "Report Source", value: `\`${source}\``, inline: true },
    ];

    if (osVersion && osVersion !== platform) {
      fields.push({ name: "OS Details", value: `\`${osVersion}\``, inline: true });
    }

    if (sanitizedLocation) {
      fields.push({ name: "Error Location", value: `\`${sanitizedLocation}\``, inline: false });
    }

    if (sanitizedUserNote) {
      fields.push({ name: "User Note", value: `> ${sanitizedUserNote}`, inline: false });
    }

    // Truncate stack trace / log excerpt to fit Discord embed field limit (1024 chars)
    if (sanitizedStack) {
      const codeLang = source.includes("rust") ? "rust" : "text";
      const maxLen = 980;
      const truncatedStack = sanitizedStack.length > maxLen
        ? sanitizedStack.slice(0, maxLen) + "\n...[truncated]"
        : sanitizedStack;
      fields.push({
        name: "Stack Trace / Log Excerpt",
        value: `\`\`\`${codeLang}\n${truncatedStack}\n\`\`\``,
        inline: false,
      });
    }

    const discordPayload = {
      username: "Listening Room Sentinel",
      avatar_url: "https://raw.githubusercontent.com/3t3333/Listening-Room/main/src-tauri/icons/128x128.png",
      embeds: [
        {
          title: embedTitle,
          description: sanitizedMsg ? `**Error Summary**:\n${sanitizedMsg}` : undefined,
          color: embedColor,
          fields,
          footer: {
            text: "Listening Room Crash Sentinel • Cloudflare Worker Proxy",
          },
          timestamp: new Date().toISOString(),
        },
      ],
    };

    // 10. Forward to Discord Webhook
    try {
      const discordResponse = await fetch(env.DISCORD_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(discordPayload),
      });

      if (!discordResponse.ok) {
        const errorText = await discordResponse.text();
        return new Response(
          JSON.stringify({
            error: "Failed to forward payload to Discord webhook.",
            discordStatus: discordResponse.status,
            discordMessage: errorText,
          }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, message: "Diagnostic report delivered to Discord." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (err) {
      return new Response(
        JSON.stringify({ error: `Network error connecting to Discord: ${err.message}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  },
};
