# Adapted Contact Worker

Cloudflare Worker that handles contact form submissions for adaptedsolutionsco.com. Stores submissions in a shared D1 database (`adapted-db`).

## Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/contact` | Turnstile | Submit contact form |
| GET | `/api/contact/submissions` | Bearer token | List recent submissions |

## Setup

See the parent [workers/README.md](../README.md) for full setup instructions including D1 database creation and schema initialization.

### Quick deploy

```bash
cd workers/contact
npx wrangler secret put TURNSTILE_SECRET_KEY
npx wrangler secret put ADMIN_TOKEN
npx wrangler deploy
```

## Environment Variables

| Variable | Type | Description |
|---|---|---|
| `TURNSTILE_SECRET_KEY` | Secret | Cloudflare Turnstile secret key |
| `ADMIN_TOKEN` | Secret | Bearer token for admin endpoints |
| `ALLOWED_ORIGINS` | Var | Comma-separated allowed CORS origins (set in wrangler.toml) |
| `DB` | D1 Binding | Shared D1 database |

## Request Format

```json
{
  "name": "Jane Smith",
  "email": "jane@example.com",
  "phone": "555-0100",
  "serviceInterest": "operations-ai",
  "message": "I'd like to learn more...",
  "honeypot": "",
  "turnstileToken": "..."
}
```

**Service interest values:** `operations-ai`, `digital-visibility`, `general`

## Local Development

```bash
npx wrangler dev
```
