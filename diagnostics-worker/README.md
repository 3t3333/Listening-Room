# Listening Room - Diagnostics & Crash Proxy (Cloudflare Worker)

This serverless proxy acts as a secure buffer between the desktop application and your private Discord webhook:
1. **Protects your Webhook**: The Discord webhook URL is kept completely secret in Cloudflare's encrypted environment variables.
2. **Crash Storm Protection**: Automatically deduplicates identical crashes within 5-minute windows and limits requests per IP so your Discord channel doesn't get flooded.
3. **Privacy Sanitization**: Automatically scrubs local user filesystem paths (`C:\Users\username\...`) and sensitive auth tokens before posting.
4. **Rich Formatting**: Transforms raw stack traces and panic dumps into structured Discord embeds.

---

## Setup Instructions

### 1. Create a Discord Webhook
1. In your Discord server, right-click the channel you want crash reports in (e.g., `#crash-reports` or `#diagnostics`).
2. Click **Edit Channel** (gear icon) -> **Integrations** -> **Webhooks** -> **New Webhook**.
3. Name it `Listening Room Sentinel`.
4. Click **Copy Webhook URL** (keep this secret!).

---

### 2. Deploy to Cloudflare (Free Tier)

#### Method A: Using Cloudflare Web Dashboard (Easiest, ~2 mins)
1. Go to [dash.cloudflare.com](https://dash.cloudflare.com).
2. Click **Workers & Pages** -> **Create application** -> **Create Worker**.
3. Name it `listening-room-diagnostics` and click **Deploy**.
4. Click **Edit code** (or **Quick edit**).
5. Paste the entire content of [`worker.js`](./worker.js) into the editor and click **Deploy**.
6. Go to the worker's **Settings** tab -> **Variables and Secrets**.
7. Click **Add**:
   - **Name**: `DISCORD_WEBHOOK_URL`
   - **Value**: Paste the Discord Webhook URL copied from Step 1.
   - Choose **Encrypt** (Secret).
8. Click **Deploy / Save**.
9. Copy your public worker URL (e.g., `https://listening-room-diagnostics.<your-account>.workers.dev`).

#### Method B: Using Wrangler CLI
```powershell
cd diagnostics-worker
npx wrangler login
npx wrangler secret put DISCORD_WEBHOOK_URL
# (Paste your Discord webhook URL when prompted)
npx wrangler deploy
```

---

### 3. Connect to the Desktop App
1. Add the worker URL to `.env` in the repository root:
   ```env
   VITE_DIAGNOSTICS_PROXY_URL=https://listening-room-diagnostics.<your-subdomain>.workers.dev
   ```
2. Launch the desktop app -> Click settings (spinning vinyl icon top left) -> Diagnostics tab -> Click **"Send Test Ping"**!
