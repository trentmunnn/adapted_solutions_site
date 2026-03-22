# Audit Worker Deployment

Cloudflare Worker for the AI Visibility Audit tool at `adaptedsolutionsco.com/api/*`.

## Endpoints

- `POST /api/audit` - Runs 16-point audit on a URL
- `POST /api/audit-lead` - Captures lead data, forwards to n8n webhook

## Deployment

### Option A: Wrangler CLI

1. Install Wrangler: `npm install -g wrangler`
2. Login: `wrangler login`
3. Create a `wrangler.toml` in this directory:

```toml
name = "adapted-audit-worker"
main = "audit-worker.js"
compatibility_date = "2024-01-01"

[vars]
# N8N_WEBHOOK_URL = "https://your-n8n-instance.com/webhook/..."

routes = [
  { pattern = "adaptedsolutionsco.com/api/*", zone_name = "adaptedsolutionsco.com" }
]
```

4. Deploy: `wrangler deploy`

### Option B: Cloudflare Dashboard

1. Go to Workers & Pages > Create Worker
2. Paste contents of `audit-worker.js`
3. Add route: `adaptedsolutionsco.com/api/*` pointing to the worker
4. Set environment variable `N8N_WEBHOOK_URL` in Settings > Variables

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `N8N_WEBHOOK_URL` | No | n8n webhook URL for lead capture forwarding |

## Notes

- The frontend audit tool has a client-side fallback if this worker is not deployed
- CORS is configured to only allow requests from `adaptedsolutionsco.com`
