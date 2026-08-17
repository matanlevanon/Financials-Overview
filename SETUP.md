# Setup

Roughly an hour, most of it waiting on account approvals. Work through in order.

## 1. Tools

Install Node 18 or newer, then Wrangler:

```bash
npm install -g wrangler
wrangler login
```

`wrangler login` opens a browser and links the CLI to your Cloudflare account.

## 2. Plaid account

1. Sign up at https://dashboard.plaid.com/signup
2. Confirm your account sits on the **Trial** plan. Free, 10 linked institutions, production data. Approval is usually automatic and occasionally takes 2 to 3 business days.
3. Open **Team Settings, Keys** and copy your `client_id` and your **Production** secret.

The Trial plan is limited to developers in the US and Canada. Moving to a paid Production plan is one way, and personal use does not need it.

## 3. Google OAuth client

Sign-in uses Google so you never store a password.

1. Open https://console.cloud.google.com and create a project.
2. Go to **APIs and Services, Credentials**.
3. Click **Create Credentials, OAuth client ID**, choose **Web application**.
4. Leave redirect URIs empty for now. You add them after the first deploy, once you know your Worker URL.
5. Copy the client ID and client secret.

## 4. Database

```bash
wrangler d1 create finance-overview
```

Copy the printed `database_id` into `wrangler.toml`, then create the tables:

```bash
wrangler d1 execute finance-overview --remote --file=schema.sql
```

The `--remote` flag matters. Without it the tables are created in a local copy and the deployed Worker sees an empty database.

## 5. Secrets

Generate two random strings first:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Run it twice. One value is `SESSION_SECRET`, the other is unused unless you enable the legacy push endpoint. `SESSION_SECRET` signs your login cookie. Changing it later signs everyone out.

```bash
wrangler secret put PLAID_CLIENT_ID
wrangler secret put PLAID_SECRET               # the Production secret
wrangler secret put SESSION_SECRET
wrangler secret put GOOGLE_LOGIN_CLIENT_ID
wrangler secret put GOOGLE_LOGIN_CLIENT_SECRET
wrangler secret put ALLOWED_EMAILS             # your Google address
```

`ALLOWED_EMAILS` accepts several addresses separated by commas or spaces. Only these accounts get in.

## 6. Deploy

```bash
wrangler deploy
```

Wrangler prints your URL, something like `https://finance-overview.<subdomain>.workers.dev`.

## 7. Finish the Google client

Back in Google Cloud Console, open your OAuth client and add this to **Authorized redirect URIs**:

```
https://<your-worker-url>/auth/callback
```

Save. Visiting your URL now shows a sign-in page. Sign in with an allowlisted address.

A `redirect_uri_mismatch` error means the URI above does not match exactly. Check for a trailing slash or http instead of https.

## 8. OAuth banks

Chase, Capital One and some others send you to the bank's own site to authorise, then back. That round trip needs a registered redirect.

1. In the Plaid dashboard, add `https://<your-worker-url>/link` to your allowed redirect URIs.
2. Set it on the Worker:

```bash
wrangler secret put PLAID_REDIRECT_URI     # https://<your-worker-url>/link
wrangler deploy
```

Chase additionally requires a security questionnaire in the Plaid dashboard before granting OAuth access. Approval times vary. Banks that do not use OAuth work without any of this, so link those first.

## 9. Link your banks

Click **Link a bank** and work through Plaid Link once per institution. Have your phone ready for two-factor prompts.

After linking, Plaid spends a minute or two pulling history. A first sync often returns accounts and no transactions. That is `PRODUCT_NOT_READY`, and the Worker skips it quietly. Press **Sync now** again shortly after.

## 10. Check the numbers

Press **Sync now** and read the dashboard.

- Money leaving an account shows negative and red. If signs are reversed, your provider uses the opposite convention. Flip the sign in `fetchItem` inside `worker.js`.
- Cards with no reported limit read "Limit not reported by issuer". Open **Credit limits** and enter them from your statements.

After that the cron runs daily. Default is 04:00 UTC, set in `wrangler.toml`. Pick an hour that lands overnight where you live.

## Optional: investment holdings

Brokerage positions come from a second Plaid product, `investments`, consented per
institution when you link. Anything you link with the current code asks for it up front.

A connection made before that consent existed returns a balance and no positions. The
Holdings panel says so. To fix it, open **Link a bank**, press **Add investments** on that
connection, walk through the bank's consent screen, then press **Sync now**.

Institutions that do not offer investments answer with a code instead of positions. The
sync status line names the institution and the reason.

## Optional: Slack alerts

Alerts fire for transactions above a threshold and cash balances below one.

1. Create a Slack app at https://api.slack.com/apps, choose **From scratch**.
2. Open **Incoming Webhooks** and turn on **Activate Incoming Webhooks**.
3. Click **Add New Webhook to Workspace**, pick a channel, click **Allow**.
4. Copy the URL and set it:

```bash
wrangler secret put SLACK_WEBHOOK_URL
wrangler deploy
```

Tune the thresholds with `ALERT_LARGE_TX` (default 1000) and `ALERT_LOW_BALANCE` (default 500). Set `ALERT_LOW_BALANCE` to `0` to switch low balance alerts off.

Alerts are deduplicated. Large transactions fire once. Low balances fire once when an account drops below the line and rearm when it recovers.

## Optional: custom domain

In the Cloudflare dashboard, open your Worker, then **Settings, Domains and Routes**, and add a custom domain. Add the new `/auth/callback` and `/link` URLs to Google and Plaid alongside the `workers.dev` ones so both keep working.

## Troubleshooting

**`redirect_uri_mismatch`** The URI in Google Cloud Console does not match your Worker URL exactly.

**`client_user_id should not contain sensitive information`** You are on an old build. Pull the current `worker.js`.

**Dashboard loads but is empty** No sync has run. Press **Sync now**. If the tables are missing, you skipped `--remote` in step 4.

**A bank shows "Needs reconnect"** The bank ended the session, often after a password change or an expired two-factor grant. Open **Link a bank** and click **Reconnect** on that row.

**Balances look stale** Check the synced timestamp in the header. If the cron is not firing, confirm `[triggers]` survived your last deploy.
