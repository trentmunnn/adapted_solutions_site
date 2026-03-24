# Adapted Solutions Workers

Two Cloudflare Workers sharing a single D1 database (`adapted-db`).

| Worker | Route | Purpose |
|---|---|---|
| `adapted-audit-worker` | `/api/audit*` | AEO/GEO audits + lead capture |
| `adapted-contact-worker` | `/api/contact*` | Contact form submissions |

## Initial Setup

### 1. Create the shared D1 database

```bash
npx wrangler d1 create adapted-db
```

Copy the output `database_id` into **both** `workers/wrangler.toml` and `workers/contact/wrangler.toml` — replace `<WILL_BE_FILLED_AFTER_CREATION>`.

### 2. Initialize the schema

```bash
npx wrangler d1 execute adapted-db --file=./db/schema.sql
```

### 3. Set up Cloudflare Turnstile

1. Cloudflare Dashboard > Security > Turnstile > create widget for `adaptedsolutionsco.com`
2. Copy the **Site Key** into the front-end form's `data-sitekey="PLACEHOLDER_SITE_KEY"` in `index.html`
3. Set the secret for the contact worker:

```bash
cd workers/contact && npx wrangler secret put TURNSTILE_SECRET_KEY
```

### 4. Set admin tokens

```bash
# Contact worker
cd workers/contact && npx wrangler secret put ADMIN_TOKEN

# Audit worker
cd workers && npx wrangler secret put ADMIN_TOKEN
```

### 5. Deploy workers

```bash
# Audit worker
cd workers && npx wrangler deploy

# Contact worker
cd workers/contact && npx wrangler deploy
```

### 6. Configure routes

**Audit worker** should already have its route (`adaptedsolutionsco.com/api/*`).

**Contact worker** — uncomment the route in `workers/contact/wrangler.toml`:

```toml
routes = [
  { pattern = "adaptedsolutionsco.com/api/contact*", zone_name = "adaptedsolutionsco.com" }
]
```

Then redeploy, or add the route via Cloudflare Dashboard > Workers & Pages > adapted-contact-worker > Triggers > Routes.

**Important:** The audit worker's broad `/api/*` route may need to be narrowed to `/api/audit*` to avoid conflicts with the contact worker route. Update `workers/wrangler.toml` if needed.

### 7. Viewing submissions

```bash
# Contact submissions
curl -H "Authorization: Bearer YOUR_TOKEN" https://adaptedsolutionsco.com/api/contact/submissions

# Audit submissions
curl -H "Authorization: Bearer YOUR_TOKEN" https://adaptedsolutionsco.com/api/audit/submissions
```

Or query D1 directly from Cloudflare Dashboard > D1 > adapted-db.

## Database

Both workers bind to the same `adapted-db` D1 database using different tables:

- `contact_submissions` — contact form entries
- `audit_submissions` — audit results + lead email capture

Schema is in `db/schema.sql`.

## Architecture Notes

- No external email services — all submissions are stored in D1 and viewable via admin endpoints or the Cloudflare dashboard
- The audit worker stores every audit run and links leads when users provide their email
- The contact worker includes Turnstile bot protection and rate limiting (3 per email per 10 min)
- n8n is no longer used
