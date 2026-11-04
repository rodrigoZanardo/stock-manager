# Deploy on Render (free plan)

Render reads `render.yaml` from the repository and creates everything in one step. You fill in the values that are secrets or depend on the public addresses.

## 1. Create the Blueprint

1. In the Render dashboard, choose **New > Blueprint**.
2. Pick `rodrigoZanardo/stock-manager` and apply.
3. Render shows the values marked as "sync: false". Fill them in as described below. You can edit any of them later under each service's **Environment** tab.

## 2. Generate the JWT keys (on your computer)

```bash
node scripts/dev-keys.mjs .keys
```

This writes `.keys/private.pem` and `.keys/public.pem`. Keep the private key secret and never commit it.

| Variable | Service | Value |
|---|---|---|
| `JWT_PRIVATE_KEY` | `stock-manager-auth` | the whole contents of `.keys/private.pem` |
| `JWT_PUBLIC_KEY` | `stock-manager-auth`, `stock-manager-stock`, `stock-manager-reports` | the whole contents of `.keys/public.pem` |

Paste the PEM with its `-----BEGIN ...-----` and `-----END ...-----` lines.

## 3. Database

Render creates one Postgres (`stock-manager-db`). Both services use it, each in its own schema.

Open `stock-manager-db` in the dashboard and copy the **Internal Database URL**. Then:

| Variable | Service | Value |
|---|---|---|
| `DATABASE_URL` | `stock-manager-auth` | the URL copied, with `?schema=auth` added at the end |
| `DATABASE_URL` | `stock-manager-stock` | the URL copied, with `?schema=stock` added at the end |

The migrations create the schema when the service starts.

## 4. Admin account

| Variable | Service | Value |
|---|---|---|
| `ADMIN_EMAIL` | `stock-manager-auth` | the admin email (for example `admin@example.com`) |
| `ADMIN_PASSWORD` | `stock-manager-auth` | a real password, at least 8 characters. The service refuses the demo password `change-me-please` in production. Keep both admin values private. |
| `DEMO_EMAIL` | `stock-manager-auth` | optional public demo account, created as OPERATOR (for example `demo@example.com`). Empty: no demo user. |
| `DEMO_PASSWORD` | `stock-manager-auth` | the demo password published in the README |
| `VIEWER_EMAIL` | `stock-manager-auth` | optional read-only account for integrations such as Live Orders. Empty: no viewer. |
| `VIEWER_PASSWORD` | `stock-manager-auth` | a real password; the integration signs in with it |

These variables create each user only when its email is not in the database yet. Changing them later does not change an existing user's password or role.

## 5. Public addresses

Each web service has an address such as `https://stock-manager-stock.onrender.com`, shown at the top of its page. Copy them after the first deploy.

| Variable | Service | Value |
|---|---|---|
| `STOCK_URL` | `stock-manager-reports` | `https://` + the address of `stock-manager-stock` |
| `API_URL` | `stock-manager-web` | `https://` + the address of `stock-manager-gateway` |

If the names are already taken, Render adds a suffix to the address. The gateway already receives the other services' addresses automatically, so only these two values need copying.

After setting `API_URL`, deploy `stock-manager-web` again.

## 6. Optional: AI analysis

`ANTHROPIC_API_KEY` on `stock-manager-reports`. Without it, the inventory page works and the AI button is hidden.

## Limits of the free plan

- Each service sleeps after about 15 minutes without requests. The first visit after that is slow.
- Check Render's current page for the free Postgres limits before relying on it for a long-running demo.
- Demo data is kept only as long as the database lives. To reset, delete the database and create it again.
