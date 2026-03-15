# Career Navigator — Prototype

AI-powered career guidance tool for scientific society members, built by [Enterprise Commons](https://enterprisecommons.ai).

## Files

| File | Description |
|------|-------------|
| `index.html` | Form page — 4-screen flow: welcome → form → loader → confirmation |
| `career-navigator-results.html` | Results / report page — personalized career guidance |
| `logo_4 (2) (1).png` | EC open book logo (color, light backgrounds) |
| `logo-white.svg` | EC open book logo (white outline, navy backgrounds) |
| `hero-image.png` | Hero background image |
| `icon-book-open.svg` | Feature card icon |
| `icon-target.svg` | Feature card icon |
| `icon-trending-up.svg` | Feature card icon |

## Prototype Flow

1. User lands on welcome screen → clicks "Start My Assessment"
2. Five-section intake form (profile, background, experience, career question, consent)
3. Loading screen with atmospheric science fun facts (~2 min in production)
4. Confirmation screen → CTA links to results page
5. Personalized career guidance report with three pathway options

## Wiring the Cassidy Webhook

Open `index.html` and find the credentials section near the top of the `<script>` block:

```javascript
var WORKER_URL = ''; // e.g. 'https://cn-career-navigator-proxy.YOUR-SUBDOMAIN.workers.dev'
```

- **Leave empty** to run in **simulation mode** (demo loader, static results page)
- **Set to your Worker URL** to go **live** with real AI-generated reports

The Cloudflare Worker handles CORS, Cassidy webhook proxying, and session-based result delivery.

## Deploying the Cloudflare Worker

The `cf-worker/` directory contains the Worker that secures the Cassidy webhook.

### Prerequisites

- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/): `npm install -g wrangler`
- Cloudflare account with Workers enabled

### Setup

```bash
cd cf-worker
npm install
wrangler login
```

### Create KV Namespace

```bash
wrangler kv:namespace create "RESULTS_KV"
```

Copy the `id` output and paste it into `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "RESULTS_KV"
id = "YOUR_KV_NAMESPACE_ID"
```

### Set Secrets

```bash
wrangler secret put CASSIDY_WEBHOOK_URL
# paste your Cassidy workflow trigger URL

wrangler secret put RECEIVE_API_KEY
# create a strong random string (e.g. openssl rand -hex 32)
# this key goes in the Cassidy Stage 4 webhook Authorization header too
```

### Deploy

```bash
wrangler deploy
```

Note your Worker URL (e.g. `https://cn-career-navigator-proxy.YOUR-SUBDOMAIN.workers.dev`) and paste it into `index.html` as `WORKER_URL`.

### CORS

The Worker allows requests from `https://mackwallace.github.io` by default. If you deploy to a different domain, add it to the `allowedOrigins` array in `cf-worker/worker.js`.

## Worker API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | POST | Receives form payload, returns `{sessionId}`, fires Cassidy |
| `/receive` | POST | Cassidy Stage 4 posts structured JSON here (requires `Authorization: Bearer RECEIVE_API_KEY`) |
| `/results/:sessionId` | GET | Frontend polls this; returns `{status:"pending"}` or `{status:"ready", data:{...}}` |

## Deploying Updates

Push changes to the `main` branch — GitHub Pages rebuilds automatically.

## Current Status

The results page shows a static prototype persona (Dr. Morgan Ellis, Senior Research Meteorologist, NOAA) until the Cassidy Stage 4 structured output pipeline is deployed. Once Stage 4 is live:

1. Deploy the Cloudflare Worker (see above)
2. Set `WORKER_URL` in both `index.html` and `career-navigator-results.html`
3. Configure Cassidy Stage 4 to POST structured JSON to `WORKER_URL/receive` with `Authorization: Bearer RECEIVE_API_KEY`
4. Real submissions will automatically populate the results page dynamically
