// Finance Overview — Cloudflare Worker.
// Pulls US accounts from Plaid on a daily cron, stores them in D1, serves the
// dashboard. Bank linking happens in-browser at /link, so no local machine is
// involved at any point.
//
// Bindings / secrets:
//   DB                          -> D1 database bound as "finance-overview"
//   PLAID_CLIENT_ID             -> from dashboard.plaid.com, Team Settings > Keys
//   PLAID_SECRET                -> the Production secret (Trial plan runs in production)
//   SESSION_SECRET              -> long random string, signs the login cookie
//   GOOGLE_LOGIN_CLIENT_ID      -> OAuth 2.0 Web client (same one as the ads dashboard)
//   GOOGLE_LOGIN_CLIENT_SECRET
//   ALLOWED_EMAILS              -> comma/space separated emails allowed to sign in
// Optional:
//   PLAID_ENV                   -> "production" (default) or "sandbox"
//   OPENFINANCE_API_KEY         -> if set, also pulls from OpenFinance
//   SLACK_WEBHOOK_URL           -> enables Slack alerts
//   ALERT_LARGE_TX              -> default 1000
//   ALERT_LOW_BALANCE           -> default 500
//   SYNC_DAYS                   -> days of transaction history, default 30

const SESSION_COOKIE = "fin_sess";
const STATE_COOKIE = "fin_oauth_state";
const SESSION_DAYS = 30;
const enc = new TextEncoder();

// Favicon: three ascending bars, drawn once as SVG and served from /favicon.svg.
const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" role="img" aria-label="Finance Overview">
  <rect width="32" height="32" rx="7" fill="#0f141b"/>
  <rect x="5"  y="16" width="6" height="11" rx="2" fill="#2a78d6"/>
  <rect x="13" y="11" width="6" height="16" rx="2" fill="#3987e5"/>
  <rect x="21" y="5"  width="6" height="22" rx="2" fill="#5598e7"/>
</svg>`;
// 180px PNG for an iOS home-screen pin, where SVG icons are not honoured.
const TOUCH_ICON_B64 = "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";

/* ---------------------------------------------------------------- helpers */

const b64url = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlDecode = (s) => atob(s.replace(/-/g, "+").replace(/_/g, "/"));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(msg)));
}

function randomHex(bytes = 16) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function getCookie(request, name) {
  const header = request.headers.get("cookie") || "";
  for (const part of header.split(/;\s*/)) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq) === name) return part.slice(eq + 1);
  }
  return null;
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });

const html = (body, status = 200) =>
  new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer"
    }
  });

/* ------------------------------------------------------------------- auth */

async function createSession(env, email) {
  const payload = b64url(enc.encode(JSON.stringify({ e: email, x: Date.now() + SESSION_DAYS * 86400000 })));
  return `${payload}.${await hmac(env.SESSION_SECRET, payload)}`;
}

async function readSession(env, request) {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token || !env.SESSION_SECRET) return null;
  const dot = token.indexOf(".");
  if (dot < 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = await hmac(env.SESSION_SECRET, payload);
  if (expected.length !== sig.length || expected !== sig) return null;
  try {
    const data = JSON.parse(b64urlDecode(payload));
    return data.x > Date.now() ? data : null;
  } catch {
    return null;
  }
}

const sessionCookie = (value, maxAge) =>
  `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;

const allowedEmails = (env) =>
  (env.ALLOWED_EMAILS || "").toLowerCase().split(/[,\s]+/).filter(Boolean);

function googleAuthRedirect(env, url) {
  const state = randomHex(16);
  const params = new URLSearchParams({
    client_id: env.GOOGLE_LOGIN_CLIENT_ID,
    redirect_uri: `${url.origin}/auth/callback`,
    response_type: "code",
    scope: "openid email",
    state,
    prompt: "select_account"
  });
  return new Response(null, {
    status: 302,
    headers: {
      location: `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
      "set-cookie": `${STATE_COOKIE}=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`
    }
  });
}

async function googleAuthCallback(env, request, url) {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = getCookie(request, STATE_COOKIE);
  const fail = (msg) => new Response(null, { status: 302, headers: { location: `/?error=${encodeURIComponent(msg)}` } });

  if (!code || !state || !expectedState || state !== expectedState) {
    return fail("Sign-in state mismatch. Please try again.");
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_LOGIN_CLIENT_ID,
      client_secret: env.GOOGLE_LOGIN_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: `${url.origin}/auth/callback`
    })
  });
  if (!tokenRes.ok) return fail("Google sign-in failed. Please try again.");
  const tokens = await tokenRes.json();
  if (!tokens.id_token) return fail("Google sign-in failed (no identity token).");

  const infoRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(tokens.id_token)}`);
  if (!infoRes.ok) return fail("Could not verify Google identity.");
  const info = await infoRes.json();
  const email = String(info.email || "").toLowerCase();

  if (info.aud !== env.GOOGLE_LOGIN_CLIENT_ID) return fail("Identity token audience mismatch.");
  if (String(info.email_verified) !== "true") return fail("Google account email is not verified.");
  if (!allowedEmails(env).includes(email)) return fail(`${email} does not have access to this dashboard.`);

  return new Response(null, {
    status: 302,
    headers: { location: "/", "set-cookie": sessionCookie(await createSession(env, email), SESSION_DAYS * 86400) }
  });
}

/* ------------------------------------------------------------------ plaid */

const plaidBase = (env) =>
  (env.PLAID_ENV || "production") === "sandbox"
    ? "https://sandbox.plaid.com"
    : "https://production.plaid.com";

async function plaid(env, path, body = {}) {
  const res = await fetch(`${plaidBase(env)}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_id: env.PLAID_CLIENT_ID, secret: env.PLAID_SECRET, ...body })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error_message || `Plaid ${path} failed (${res.status})`);
    err.code = data.error_code;
    throw err;
  }
  return data;
}

async function listItems(env) {
  const rows = await env.DB.prepare("SELECT item_id, access_token, institution, last_error FROM plaid_items").all();
  return rows.results || [];
}

// An Item whose bank needs the user to re-authenticate (expired session, a new
// 2FA challenge, changed credentials) reports ITEM_LOGIN_REQUIRED. Record it so
// the link page can offer a Reconnect button, and clear it on a good sync.
async function setItemError(env, itemId, code) {
  await env.DB.prepare("UPDATE plaid_items SET last_error = ? WHERE item_id = ?")
    .bind(code || null, itemId).run();
}

async function fetchItem(env, item, startDate, endDate) {
  const bal = await plaid(env, "/accounts/balance/get", { access_token: item.access_token });

  const accounts = bal.accounts.map((a) => ({
    id: a.account_id,
    item_id: item.item_id,
    source: item.institution || "plaid",
    name: a.name || a.official_name || "Account",
    type: a.subtype || a.type || null,
    currency: a.balances.iso_currency_code || "USD",
    balance: Number(a.balances.current ?? 0),
    available: a.balances.available == null ? null : Number(a.balances.available),
    // Plaid exposes the credit limit directly. Many issuers (Capital One among
    // them) return limit but leave available null, so read both.
    creditLimit: a.balances.limit == null ? null : Number(a.balances.limit)
  }));

  const transactions = [];
  let offset = 0;

  for (let page = 0; page < 10; page++) {
    let tx;
    try {
      tx = await plaid(env, "/transactions/get", {
        access_token: item.access_token,
        start_date: startDate,
        end_date: endDate,
        options: { count: 500, offset }
      });
    } catch (err) {
      // Right after linking, Plaid is still pulling history. Skip this run.
      if (err.code === "PRODUCT_NOT_READY") break;
      throw err;
    }

    for (const t of tx.transactions) {
      transactions.push({
        id: t.transaction_id,
        account_id: t.account_id,
        date: t.date,
        name: t.merchant_name || t.name || "Transaction",
        // Plaid reports positive for money out. Flip so the dashboard shows
        // outflow as negative.
        amount: -Number(t.amount ?? 0),
        currency: t.iso_currency_code || "USD",
        category: (t.personal_finance_category && t.personal_finance_category.primary) || null,
        pending: Boolean(t.pending),
        // When a pending charge posts, Plaid issues it a NEW transaction_id and
        // points pending_transaction_id at the old one. Without acting on this
        // both copies survive the upsert and the purchase is counted twice.
        replaces: t.pending_transaction_id || null
      });
    }

    offset += tx.transactions.length;
    if (!tx.transactions.length || offset >= (tx.total_transactions ?? offset)) break;
  }

  return { accounts, transactions };
}

async function fetchFromPlaid(env) {
  const items = await listItems(env);
  const days = Number(env.SYNC_DAYS || 30);
  const startDate = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const endDate = new Date().toISOString().slice(0, 10);

  const accounts = [];
  const transactions = [];
  const errors = [];

  for (const item of items) {
    try {
      const r = await fetchItem(env, item, startDate, endDate);
      accounts.push(...r.accounts);
      transactions.push(...r.transactions);
      if (item.last_error) await setItemError(env, item.item_id, null);
    } catch (err) {
      // One broken connection must not stop the others syncing.
      errors.push(`${item.institution || item.item_id}: ${err.message}`);
      if (err.code) await setItemError(env, item.item_id, err.code);
    }
  }

  return { accounts, transactions, errors };
}

/* ------------------------------------------------------------ open finance */

const unwrap = (body, key) => {
  if (Array.isArray(body)) return body;
  for (const k of [key, "data", "results", "items"]) {
    if (body && Array.isArray(body[k])) return body[k];
  }
  return [];
};

async function fetchFromOpenFinance(env) {
  const base = env.OPENFINANCE_URL || "https://api.openfinance.sh";
  const call = async (path, params = {}) => {
    const url = new URL(path, base);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
    const res = await fetch(url, { headers: { authorization: `Bearer ${env.OPENFINANCE_API_KEY}` } });
    if (!res.ok) throw new Error(`OpenFinance ${path}: ${res.status}`);
    return res.json();
  };

  const accounts = unwrap(await call("/api/accounts"), "accounts").map((a) => ({
    id: String(a.id),
    source: "openfinance",
    name: a.name || a.officialName || "Account",
    type: a.subtype || a.type || null,
    currency: a.isoCurrencyCode || "USD",
    balance: Number(a.currentBalance ?? 0),
    available: a.availableBalance == null ? null : Number(a.availableBalance)
  }));

  const currencyOf = new Map(accounts.map((a) => [a.id, a.currency]));
  const days = Number(env.SYNC_DAYS || 30);
  const startDate = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const transactions = [];
  let cursor = null;

  for (let page = 0; page < 20; page++) {
    const body = await call("/api/transactions", { startDate, limit: 250, cursor });
    const rows = unwrap(body, "transactions");
    if (!rows.length) break;
    for (const t of rows) {
      const accountId = String(t.accountId);
      transactions.push({
        id: String(t.id),
        account_id: accountId,
        date: String(t.date).slice(0, 10),
        name: t.merchantName || t.name || "Transaction",
        amount: -Number(t.amount ?? 0),
        currency: currencyOf.get(accountId) || "USD",
        category: t.category || null,
        pending: Boolean(t.pending)
      });
    }
    cursor = body && (body.nextCursor || body.cursor);
    if (!cursor) break;
  }

  return { accounts, transactions };
}

/* ------------------------------------------------------------------ store */

async function store(env, accounts, transactions) {
  const now = new Date().toISOString();
  const stmts = [];

  for (const a of accounts) {
    stmts.push(env.DB.prepare(
      `INSERT INTO accounts (id, item_id, source, name, type, currency, balance, available, credit_limit, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         item_id=excluded.item_id, name=excluded.name, source=excluded.source,
         balance=excluded.balance, available=excluded.available,
         credit_limit=excluded.credit_limit, updated_at=excluded.updated_at`
    ).bind(a.id, a.item_id ?? null, a.source, a.name, a.type || null, a.currency, a.balance,
           a.available ?? null, a.creditLimit ?? null, now));
  }

  for (const t of transactions) {
    stmts.push(env.DB.prepare(
      `INSERT INTO transactions (id, account_id, date, name, amount, currency, category, pending, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         amount=excluded.amount, pending=excluded.pending, synced_at=excluded.synced_at`
    ).bind(t.id, t.account_id, t.date, t.name, t.amount, t.currency, t.category || null, t.pending ? 1 : 0, now));
  }

  // Remove pending rows that have since posted under a new id.
  const superseded = transactions.map((t) => t.replaces).filter(Boolean);
  for (let i = 0; i < superseded.length; i += 50) {
    const chunk = superseded.slice(i, i + 50);
    await env.DB.prepare(
      `DELETE FROM transactions WHERE id IN (${chunk.map(() => "?").join(",")})`
    ).bind(...chunk).run();
  }

  // D1 caps how much one batch can carry, so chunk it.
  for (let i = 0; i < stmts.length; i += 50) {
    await env.DB.batch(stmts.slice(i, i + 50));
  }
}

/* ----------------------------------------------------------------- alerts */

// Moving money between your own accounts is not spending, so it never alerts.
const ALERT_SKIP_CATEGORIES = new Set(["LOAN_PAYMENTS", "TRANSFER_IN", "TRANSFER_OUT"]);
// Only cash accounts can be "low". A credit card at zero is paid off, and a
// brokerage balance is holdings rather than spendable cash.
const DEPOSIT_TYPES = new Set(["checking", "savings", "money market", "cash management", "prepaid"]);

// Deduped through alerts_log, otherwise a daily cron re-sends the same alert
// every run for as long as the condition holds.
async function runAlerts(env, accounts, transactions) {
  const webhook = env.SLACK_WEBHOOK_URL;
  if (!webhook) return 0;

  const largeTx = Number(env.ALERT_LARGE_TX || 1000);
  const lowBalance = Number(env.ALERT_LOW_BALANCE || 500);
  // Incoming webhooks cannot override the app name or icon per message, so if
  // this webhook lives on a shared app the text has to say who is speaking.
  const tag = env.ALERT_PREFIX === "" ? "" : (env.ALERT_PREFIX || "*Finance*") + "  ";
  const candidates = [];
  const recovered = [];

  for (const a of accounts) {
    if (!DEPOSIT_TYPES.has(String(a.type || "").toLowerCase())) continue;
    const key = `low_balance:${a.id}`;
    if (a.balance < lowBalance) {
      candidates.push({
        key,
        message: `${tag}Low balance: ${a.name} at ${a.balance.toLocaleString()} ${a.currency}`
      });
    } else {
      // Back above the line: forget the old alert so the next dip fires again.
      recovered.push(key);
    }
  }
  for (const t of transactions) {
    if (ALERT_SKIP_CATEGORIES.has(t.category)) continue;
    if (Math.abs(t.amount) >= largeTx) {
      candidates.push({
        key: `large_tx:${t.id}`,
        message: `${tag}Large transaction: ${t.name} for ${t.amount.toLocaleString()} ${t.currency} on ${t.date}`
      });
    }
  }

  if (recovered.length) {
    const ph = recovered.map(() => "?").join(",");
    await env.DB.prepare(`DELETE FROM alerts_log WHERE rule IN (${ph})`).bind(...recovered).run();
  }
  if (!candidates.length) return 0;

  const placeholders = candidates.map(() => "?").join(",");
  const seen = await env.DB.prepare(`SELECT rule FROM alerts_log WHERE rule IN (${placeholders})`)
    .bind(...candidates.map((c) => c.key)).all();
  const already = new Set((seen.results || []).map((r) => r.rule));
  const fresh = candidates.filter((c) => !already.has(c.key));
  if (!fresh.length) return 0;

  const sentAt = new Date().toISOString();
  for (const c of fresh) {
    await fetch(webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: c.message })
    });
  }
  await env.DB.batch(fresh.map((c) =>
    env.DB.prepare("INSERT INTO alerts_log (rule, message, sent_at) VALUES (?, ?, ?)")
      .bind(c.key, c.message, sentAt)
  ));
  return fresh.length;
}

async function syncNow(env) {
  const accounts = [];
  const transactions = [];
  const errors = [];

  if (env.PLAID_CLIENT_ID && env.PLAID_SECRET) {
    const r = await fetchFromPlaid(env);
    accounts.push(...r.accounts);
    transactions.push(...r.transactions);
    errors.push(...r.errors);
  }

  if (env.OPENFINANCE_API_KEY) {
    try {
      const r = await fetchFromOpenFinance(env);
      accounts.push(...r.accounts);
      transactions.push(...r.transactions);
    } catch (err) {
      errors.push(`openfinance: ${err.message}`);
    }
  }

  await store(env, accounts, transactions);
  const alerts = await runAlerts(env, accounts, transactions);

  return { ok: true, accounts: accounts.length, transactions: transactions.length, alerts, errors };
}

/* -------------------------------------------------------------- link page */

function linkPage() {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Link a bank — Finance Overview</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/apple-touch-icon.png"><meta name="theme-color" content="#0f141b">
<meta name="viewport" content="width=device-width,initial-scale=1">
<script src="https://cdn.plaid.com/link/v2/stable/link-initialize.js"></script>
<style>
body{font-family:system-ui,sans-serif;background:#0b0f14;color:#e6e6e6;margin:0;padding:32px;max-width:640px}
h1{font-size:18px;font-weight:500;margin:0 0 4px}
.sub{color:#8a8f98;font-size:13px;margin-bottom:24px}
button{background:#2f6fed;color:#fff;border:0;border-radius:8px;padding:11px 20px;font-size:14px;cursor:pointer}
button:hover{background:#265fd0}
button:disabled{opacity:.5;cursor:default}
button.small{background:#1d2630;border:1px solid #2c3743;padding:4px 10px;font-size:12px}
button.small:hover{background:#243040}
button.danger{border-color:#e66767;color:#e66767}
button.danger:hover{background:rgba(230,103,103,.12);color:#fff}
td.act{text-align:right;white-space:nowrap}
.dupe{color:#fab219;font-size:11px}
#status{margin-top:16px;font-size:13px;color:#8a8f98;white-space:pre-wrap}
.warn{color:#e0a45e}.ok{color:#6ac48a}
a{color:#8a8f98;font-size:13px}
table{width:100%;border-collapse:collapse;margin:24px 0;font-size:13px}
th{text-align:left;color:#8a8f98;font-weight:400;font-size:11px;text-transform:uppercase;padding:6px 10px;border-bottom:1px solid #232b34}
td{padding:8px 10px;border-bottom:1px solid #171d24}
</style></head>
<body>
<h1>Link a bank</h1>
<div class="sub">Opens your bank's own login. Credentials go to Plaid, never to this app.</div>

<div id="linked"></div>
<button id="go">Connect an account</button>
<div id="status"></div>
<p style="margin-top:28px"><a href="/">Back to dashboard</a></p>

<script>
const status = document.getElementById('status');

async function loadLinked() {
  const res = await fetch('/api/link/list');
  const body = await res.json();
  const el = document.getElementById('linked');
  if (!body.items || !body.items.length) { el.innerHTML = ''; return; }
  const seen = {};
  body.items.forEach(i => { seen[i.institution] = (seen[i.institution] || 0) + 1; });

  el.innerHTML = '<table><thead><tr><th>Linked</th><th>Added</th><th>Status</th><th></th></tr></thead><tbody>' +
    body.items.map(i => {
      const broken = i.last_error === 'ITEM_LOGIN_REQUIRED';
      const cell = broken
        ? '<span class="warn">Needs reconnect</span> <button class="small" data-item="' + i.item_id + '">Reconnect</button>'
        : (i.last_error ? '<span class="warn">' + i.last_error + '</span>' : '<span class="ok">OK</span>');
      const dupe = seen[i.institution] > 1 ? ' <span class="dupe">linked ' + seen[i.institution] + 'x</span>' : '';
      return '<tr><td>' + i.institution + dupe + '</td><td>' + i.added_at.slice(0,10) + '</td><td>' + cell +
        '</td><td class="act"><button class="small danger" data-rm="' + i.item_id + '">Remove</button></td></tr>';
    }).join('') + '</tbody></table>' +
    '<p class="sub" style="margin-top:10px">Removing revokes the connection at Plaid and deletes its accounts and ' +
    'transactions from your database. On the Plaid Trial plan this does not free a slot.</p>';

  el.querySelectorAll('button[data-item]').forEach(b => {
    b.onclick = () => openLink(b.getAttribute('data-item'), b);
  });
  // Two-step confirm rather than a browser dialog.
  el.querySelectorAll('button[data-rm]').forEach(b => {
    b.onclick = async () => {
      if (b.dataset.armed !== '1') {
        el.querySelectorAll('button[data-rm]').forEach(o => {
          o.dataset.armed = ''; o.textContent = 'Remove';
        });
        b.dataset.armed = '1'; b.textContent = 'Confirm?';
        setTimeout(() => { if (b.dataset.armed === '1') { b.dataset.armed=''; b.textContent='Remove'; } }, 5000);
        return;
      }
      b.disabled = true; b.textContent = 'Removing...';
      status.textContent = '';
      try {
        const res = await fetch('/api/link/remove', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ item_id: b.getAttribute('data-rm') })
        });
        const r = await res.json();
        if (!res.ok) throw new Error(r.error || res.status);
        status.textContent = 'Removed ' + r.institution + ', ' + r.accounts + ' account(s) deleted' +
          (r.revoked ? '.' : '. Plaid revoke failed, remove it from your Plaid dashboard too.');
        loadLinked();
      } catch (err) {
        status.textContent = 'Failed: ' + err.message;
        b.disabled = false; b.textContent = 'Remove';
      }
    };
  });
}
loadLinked();

// itemId set = update mode, re-authenticating an existing connection.
async function openLink(itemId, btn) {
  btn.disabled = true;
  status.textContent = 'Preparing...';
  try {
    const res = await fetch('/api/link/token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(itemId ? { item_id: itemId } : {})
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'could not create link token');
    status.textContent = '';
    Plaid.create({
      token: body.link_token,
      onSuccess: async (public_token) => {
        // In update mode the access_token is unchanged, so there is nothing
        // to exchange. Only a fresh link produces a token worth saving.
        if (body.update) {
          status.textContent = 'Reconnected. Press Sync now on the dashboard.';
          btn.disabled = false;
          loadLinked();
          return;
        }
        status.textContent = 'Saving connection...';
        const ex = await fetch('/api/link/exchange', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ public_token })
        });
        const exBody = await ex.json();
        if (!ex.ok) { status.textContent = 'Failed: ' + (exBody.error || ex.status); btn.disabled = false; return; }
        status.textContent = 'Linked ' + exBody.institution + '. Transactions can take a minute to appear.';
        btn.disabled = false;
        loadLinked();
      },
      onExit: (err) => {
        status.textContent = err ? ('Exited: ' + (err.display_message || err.error_message || '')) : '';
        btn.disabled = false;
      }
    }).open();
  } catch (err) {
    status.textContent = 'Failed: ' + err.message;
    btn.disabled = false;
  }
}

document.getElementById('go').onclick = (e) => openLink(null, e.target);
</script>
</body></html>`;
}

/* -------------------------------------------------------------- dashboard */

async function handleDashboard(env, email) {
  const acctRows = await env.DB.prepare("SELECT * FROM accounts ORDER BY balance DESC").all();
  const txRows = await env.DB.prepare(
    "SELECT date, name, amount, category, account_id, pending FROM transactions ORDER BY date DESC LIMIT 800"
  ).all();
  const lastSync = (acctRows.results[0] && acctRows.results[0].updated_at) || null;

  const accounts = (acctRows.results || []).map((a) => ({
    id: a.id,
    src: a.source,
    name: a.name,
    type: a.type || "",
    cur: a.currency,
    bal: Number(a.balance) || 0,
    // Precedence: a limit you entered yourself, then the issuer's reported
    // limit, then a reconstruction from available credit. Capital One reports
    // neither, which is why the manual override exists.
    limit: a.type !== "credit card" ? null
      : a.manual_limit != null ? Number(a.manual_limit)
      : a.credit_limit != null ? Number(a.credit_limit)
      : a.available != null ? Number(a.available) + Number(a.balance)
      : null,
    manual: a.manual_limit != null,
    // what the issuer reports, so clearing an override can fall back without a reload
    reported: a.type !== "credit card" ? null
      : a.credit_limit != null ? Number(a.credit_limit)
      : a.available != null ? Number(a.available) + Number(a.balance)
      : null
  }));

  const tx = (txRows.results || []).map((t) => ({
    date: t.date,
    name: t.name,
    amount: Number(t.amount) || 0,
    category: t.category || "OTHER",
    account: t.account_id,
    pending: t.pending ? 1 : 0
  }));

  // Embedded as JSON so filtering is instant and client-side. The page already
  // sits behind the Google login, so this exposes nothing new.
  const payload = JSON.stringify({ accounts, tx, email, lastSync }).replace(/</g, "\\u003c");

  return html(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Finance Overview</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/apple-touch-icon.png"><meta name="theme-color" content="#0f141b">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{color-scheme:dark;
  --plane:#0a0e13;--card:#141a21;--text-primary:#fff;--text-secondary:#c3c2b7;--muted:#898781;
  --grid:#1e252e;--baseline:#2c3540;--border:rgba(255,255,255,.10);
  --assets:#3987e5;--debt:#e66767;--good:#0ca30c;
  --s500:#256abf;--s450:#2a78d6;--s400:#3987e5;--s350:#5598e7;--s300:#6da7ec;
  --sel:rgba(57,135,229,.14);--sel-line:#3987e5}
:root[data-theme="light"]{color-scheme:light;
  --plane:#f4f4f1;--card:#fff;--text-primary:#0b0b0b;--text-secondary:#52514e;--muted:#6f6e69;
  --grid:#e1e0d9;--baseline:#c3c2b7;--border:rgba(11,11,11,.10);
  --assets:#2a78d6;--debt:#e34948;--good:#006300;--sel:rgba(42,120,214,.10);--sel-line:#2a78d6}
*{box-sizing:border-box}
body{margin:0;background:var(--plane);color:var(--text-primary);
  font-family:system-ui,-apple-system,"Segoe UI",sans-serif;padding:26px 30px 60px}
header{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;flex-wrap:wrap;margin-bottom:16px}
h1{font-size:15px;font-weight:600;margin:0 0 3px}
.sub{color:var(--muted);font-size:12.5px}
.who{color:var(--muted);font-size:12.5px;text-align:right;margin-bottom:8px}
.who a{color:var(--muted)}
button,a.btn{background:var(--card);color:var(--text-secondary);border:1px solid var(--border);
  border-radius:8px;padding:7px 13px;font-size:12.5px;cursor:pointer;font-family:inherit;
  text-decoration:none;display:inline-block}
button:hover,a.btn:hover{border-color:var(--muted);color:var(--text-primary)}
button:disabled{opacity:.5;cursor:default}
.controls{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.filterbar{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-bottom:16px;min-height:34px;
  font-size:12.5px;color:var(--muted)}
.chip{display:inline-flex;align-items:center;gap:8px;background:var(--sel);border:1px solid var(--sel-line);
  border-radius:999px;padding:5px 8px 5px 12px;color:var(--text-primary);font-size:12.5px}
.chip button{background:none;border:0;color:var(--text-secondary);padding:0 2px;font-size:14px;line-height:1}
.hero-wrap{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:22px 24px;
  margin-bottom:14px;display:flex;justify-content:space-between;align-items:flex-end;gap:30px;flex-wrap:wrap}
.hero-label{font-size:11.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:7px}
.hero-figure{font-size:50px;font-weight:600;line-height:1;letter-spacing:-.02em}
.hero-note{font-size:12.5px;color:var(--muted);margin-top:9px}
.split{min-width:270px;flex:1;max-width:400px}
.split-label{font-size:11.5px;color:var(--muted);margin-bottom:9px;display:flex;justify-content:space-between}
.split-bar{display:flex;height:32px;gap:2px}
.split-seg{border-radius:4px}
.split-seg.a{background:var(--assets)}.split-seg.d{background:var(--debt)}
.split-legend{display:flex;gap:16px;margin-top:10px;font-size:12px;flex-wrap:wrap}
.split-legend span{display:flex;align-items:center;gap:7px;color:var(--text-secondary)}
.dot{width:9px;height:9px;border-radius:2px}
.dot.a{background:var(--assets)}.dot.d{background:var(--debt)}
.legend-val{color:var(--text-primary);font-weight:500}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(172px,1fr));gap:12px;margin-bottom:14px}
.kpi{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:14px 16px}
.kpi .k{font-size:11.5px;color:var(--muted);margin-bottom:6px}
.kpi .v{font-size:22px;font-weight:600}
.kpi .d{font-size:11.5px;color:var(--text-secondary);margin-top:5px}
.kpi .d.good{color:var(--good)}
.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:14px;align-items:start}
.grid3>*{min-width:0}
@media(max-width:1180px){.grid3{grid-template-columns:1fr 1fr}}
@media(max-width:760px){.grid3{grid-template-columns:1fr}}
.card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:17px 19px;min-width:0;overflow:hidden}
.card-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:3px}
.card h2{font-size:13px;font-weight:600;margin:0}
.card .cap{font-size:11.5px;color:var(--muted);margin-bottom:16px;line-height:1.5}
.btn-clear{font-size:11px;padding:4px 9px;border-radius:6px;flex:none;visibility:hidden}
.btn-clear.on{visibility:visible}
.row{margin:0 -8px 4px;padding:7px 8px 9px;border-radius:8px;cursor:pointer;border:1px solid transparent}
.row:hover{background:var(--sel)}
.row.sel{background:var(--sel);border-color:var(--sel-line)}
.row.dim{opacity:.32}
.row-top{display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:6px;gap:12px;min-width:0}
.row-name{color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1 1 auto}
.row.sel .row-name{color:var(--text-primary)}
.row-val{color:var(--text-primary);font-weight:500;flex:none;font-variant-numeric:tabular-nums}
.track{height:9px;background:var(--grid);border-radius:4px;overflow:hidden}
.fill{height:100%;border-radius:4px}
.meta{font-size:10.5px;color:var(--muted);margin-top:5px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.linkbtn{background:none;border:0;color:var(--assets);font-size:10.5px;padding:0;cursor:pointer;
  text-decoration:underline;font-family:inherit}
.linkbtn:hover{color:var(--text-primary)}
.badge{font-size:9.5px;border:1px solid var(--border);border-radius:4px;padding:1px 5px;color:var(--muted)}
.modal{position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;
  justify-content:center;padding:20px;z-index:100}
.modal[hidden]{display:none}
.modal-card{background:var(--card);border:1px solid var(--border);border-radius:14px;
  width:100%;max-width:560px;max-height:86vh;display:flex;flex-direction:column;overflow:hidden}
.modal-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;
  padding:20px 22px 0}
.modal-head h2{font-size:14px;font-weight:600;margin:0 0 3px}
.modal-body{padding:14px 22px;overflow-y:auto}
.modal-foot{display:flex;justify-content:flex-end;gap:9px;padding:14px 22px 20px;
  border-top:1px solid var(--grid);margin-top:auto}
.modal-foot .primary{background:var(--assets);border-color:var(--assets);color:#fff}
.modal-foot .primary:hover{opacity:.9;color:#fff}
.limrow{display:flex;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid var(--grid)}
.limrow:last-child{border-bottom:0}
.limrow .who{flex:1;min-width:0}
.limrow .nm{font-size:12.5px;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.limrow .sb{font-size:11px;color:var(--muted);margin-top:2px}
.limrow input{background:var(--plane);border:1px solid var(--border);border-radius:7px;
  color:var(--text-primary);font-size:13px;padding:7px 9px;width:120px;font-family:inherit;
  text-align:right;font-variant-numeric:tabular-nums}
.limrow input:focus{outline:none;border-color:var(--assets)}
.modal .note{font-size:11.5px;color:var(--muted);line-height:1.55;margin:0 0 6px}
#limstatus{font-size:12px;color:var(--muted);margin-right:auto;align-self:center}
table{width:100%;border-collapse:collapse;font-size:12.5px}
th{text-align:left;color:var(--muted);font-weight:400;font-size:10.5px;text-transform:uppercase;
  letter-spacing:.06em;padding:7px 9px;border-bottom:1px solid var(--baseline)}
td{padding:9px;border-bottom:1px solid var(--grid);color:var(--text-secondary)}
td.name{color:var(--text-primary)}
td.num{text-align:right;font-variant-numeric:tabular-nums;color:var(--text-primary)}
.neg{color:var(--debt)}.pos{color:var(--good)}
tr.xfer td{opacity:.45}
.tag{font-size:10px;border:1px solid var(--border);border-radius:4px;padding:1px 6px;color:var(--muted);margin-left:6px}
.tag.pend{border-color:var(--warning);color:var(--warning)}
.empty{color:var(--muted);font-size:12.5px;padding:20px 4px;text-align:center;font-style:italic}
#status{font-size:12.5px;color:var(--muted);margin-left:4px}
/* the table is the widest thing on the page: let it scroll inside its card
   rather than pushing past the rounded background */
#txwrap{overflow-x:auto;-webkit-overflow-scrolling:touch}
#txwrap table{min-width:100%}
td.name{max-width:none}
.sub-meta{display:none;color:var(--muted);font-size:11px;margin-top:3px}
@media(max-width:760px){
  body{padding:18px 14px 48px}
  .hero-wrap{padding:18px 16px}
  .hero-figure{font-size:38px}
  .kpis{grid-template-columns:1fr 1fr;gap:10px}
  .kpi{padding:12px 13px}
  .kpi .v{font-size:19px}
  .kpi .k,.kpi .d{font-size:11px}
  .card{padding:15px 15px}
  /* drop Account and Category columns; they reappear under the name */
  th:nth-child(3),th:nth-child(4),td:nth-child(3),td:nth-child(4){display:none}
  .sub-meta{display:block}
  th,td{padding:8px 6px}
  td:first-child,th:first-child{white-space:nowrap}
  header{gap:12px}
  .controls{justify-content:flex-start}
  .who{text-align:left}
}
</style></head>
<body>
<header>
  <div><h1>Finance Overview</h1><div class="sub" id="subtitle"></div></div>
  <div>
    <div class="who">${esc(email)} &nbsp;<a href="/logout">Sign out</a></div>
    <div class="controls">
      <a class="btn" href="/link">Link a bank</a>
      <button id="sync">Sync now</button>
      <button id="limits">Credit limits</button>
      <button id="theme">Light</button>
      <span id="status"></span>
    </div>
  </div>
</header>

<div class="filterbar" id="filterbar"></div>

<div class="hero-wrap">
  <div>
    <div class="hero-label">Net worth</div>
    <div class="hero-figure" id="hero">—</div>
    <div class="hero-note">What you own minus what you owe on cards. Balances ignore filters.</div>
  </div>
  <div class="split">
    <div class="split-label"><span>Composition</span><span id="gross"></span></div>
    <div class="split-bar" id="splitbar"></div>
    <div class="split-legend" id="splitlegend"></div>
  </div>
</div>

<div class="kpis" id="kpis"></div>

<div class="grid3">
  <div class="card">
    <div class="card-head"><h2>Where the money sits</h2><button class="btn-clear" id="clearAssets" data-clear="account">Clear</button></div>
    <div class="cap" id="capAssets"></div><div id="assets"></div>
  </div>
  <div class="card">
    <div class="card-head"><h2>Cards</h2><button class="btn-clear" id="clearCards" data-clear="account">Clear</button></div>
    <div class="cap" id="capCards"></div><div id="cards"></div>
  </div>
  <div class="card">
    <div class="card-head"><h2>Spending by category</h2><button class="btn-clear" id="clearCat" data-clear="category">Clear</button></div>
    <div class="cap" id="capCat"></div><div id="cats"></div>
  </div>
</div>

<div class="card">
  <div class="card-head"><h2>Transactions</h2><button class="btn-clear" id="clearTx" data-clear="all">Clear all</button></div>
  <div class="cap" id="capTx"></div><div id="txwrap"></div>
</div>

<div class="modal" id="limmodal" hidden>
  <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="limtitle">
    <div class="modal-head">
      <div>
        <h2 id="limtitle">Credit limits</h2>
        <p class="note">Some issuers do not report a credit line through Plaid. Enter it here and
        utilisation is calculated against your figure. Leave blank to use whatever the bank reports.</p>
      </div>
    </div>
    <div class="modal-body" id="limrows"></div>
    <div class="modal-foot">
      <span id="limstatus"></span>
      <button id="limcancel">Cancel</button>
      <button id="limsave" class="primary">Save</button>
    </div>
  </div>
</div>

<script id="data" type="application/json">${payload}</script>
<script>
const DATA = JSON.parse(document.getElementById('data').textContent);
const ACCOUNTS = DATA.accounts, TX = DATA.tx;
const XFER = new Set(["LOAN_PAYMENTS","TRANSFER_IN","TRANSFER_OUT"]);
const LABEL = {TRAVEL:"Travel",GENERAL_SERVICES:"General services",GENERAL_MERCHANDISE:"General merchandise",
  INCOME:"Income",LOAN_PAYMENTS:"Card payment",TRANSFER_IN:"Transfer in",TRANSFER_OUT:"Transfer out",
  FOOD_AND_DRINK:"Food and drink",TRANSPORTATION:"Transportation",ENTERTAINMENT:"Entertainment",
  RENT_AND_UTILITIES:"Rent and utilities",MEDICAL:"Medical",PERSONAL_CARE:"Personal care",OTHER:"Other"};
const RAMP=["var(--s500)","var(--s450)","var(--s400)","var(--s350)","var(--s300)"];
const byId=Object.fromEntries(ACCOUNTS.map(a=>[a.id,a]));
const money=n=>n.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
const money0=n=>"$"+Math.round(n).toLocaleString("en-US");
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let state={account:null,category:null};


const matches=(t,f)=>(!f.account||t.account===f.account)&&(!f.category||t.category===f.category);
const acctHasCat=(id,cat)=>!cat||TX.some(t=>t.account===id&&t.category===cat);
function spendByCategory(acct){
  const m={};
  for(const t of TX){
    if(XFER.has(t.category)||t.amount>=0) continue;
    if(acct&&t.account!==acct) continue;
    (m[t.category]=m[t.category]||{spent:0,n:0}).spent+=-t.amount; m[t.category].n++;
  }
  return Object.entries(m).map(([cat,v])=>({cat,...v})).sort((a,b)=>b.spent-a.spent);
}

function render(){
  const assets=ACCOUNTS.filter(a=>a.type!=="credit card");
  const cards=ACCOUNTS.filter(a=>a.type==="credit card");
  const A=assets.reduce((s,a)=>s+a.bal,0), L=cards.reduce((s,a)=>s+a.bal,0);
  const insts=new Set(ACCOUNTS.map(a=>a.src)).size;

  document.getElementById("subtitle").textContent =
    ACCOUNTS.length+" accounts · "+insts+" institutions · "+TX.length+" transactions"+
    (DATA.lastSync?" · synced "+DATA.lastSync.slice(0,16).replace("T"," "):"");

  document.getElementById("hero").textContent="$"+money(A-L);
  document.getElementById("gross").textContent=money0(A+L)+" gross";
  const tot=(A+L)||1;
  document.getElementById("splitbar").innerHTML=
    '<div class="split-seg a" style="width:'+(A/tot*100).toFixed(1)+'%"></div>'+
    '<div class="split-seg d" style="width:'+(L/tot*100).toFixed(1)+'%"></div>';
  document.getElementById("splitlegend").innerHTML=
    '<span><i class="dot a"></i>Assets <b class="legend-val">'+money0(A)+'</b></span>'+
    '<span><i class="dot d"></i>Card debt <b class="legend-val">'+money0(L)+'</b></span>';

  const shown=TX.filter(t=>matches(t,state));
  const buys=shown.filter(t=>!XFER.has(t.category)&&t.amount<0);
  const spend=buys.reduce((s,t)=>s-t.amount,0);
  const cash=assets.filter(a=>a.type!=="brokerage").reduce((s,a)=>s+a.bal,0);
  const invest=assets.filter(a=>a.type==="brokerage").reduce((s,a)=>s+a.bal,0);
  // Only cards with a real limit can be measured. Falling back to the balance
  // would invent a denominator and quietly understate utilisation.
  const known=cards.filter(a=>a.limit!=null&&a.limit>0);
  const noLimit=cards.filter(a=>!(a.limit!=null&&a.limit>0));
  const knownLimit=known.reduce((s,a)=>s+a.limit,0);
  const knownDebt=known.reduce((s,a)=>s+a.bal,0);
  const hiddenDebt=noLimit.reduce((s,a)=>s+a.bal,0);
  const util=knownLimit?knownDebt/knownLimit*100:null;
  const on=state.account||state.category;

  document.getElementById("kpis").innerHTML=
    '<div class="kpi"><div class="k">Cash &amp; savings</div><div class="v">'+money0(cash)+
      '</div><div class="d">'+assets.filter(a=>a.type!=="brokerage").length+' deposit accounts</div></div>'+
    '<div class="kpi"><div class="k">Investments</div><div class="v">'+money0(invest)+
      '</div><div class="d">'+(assets.filter(a=>a.type==="brokerage").length||0)+' brokerage</div></div>'+
    '<div class="kpi"><div class="k">'+(on?"Spend · filtered":"Real spend")+'</div><div class="v">'+money0(spend)+
      '</div><div class="d">'+buys.length+' purchase'+(buys.length===1?"":"s")+', transfers excluded'+
      (buys.filter(t=>t.pending).length?'<br>includes '+buys.filter(t=>t.pending).length+' still pending':"")+
      '</div></div>'+
    '<div class="kpi"><div class="k">Credit utilisation</div><div class="v">'+
      (util==null?"—":util.toFixed(1)+"%")+'</div><div class="d'+(hiddenDebt>0?"":" good")+'">'+
      (util==null
        ? 'No limits known yet'
        : money0(knownDebt)+' of '+money0(knownLimit))+
      (hiddenDebt>0
        ? '<br>'+money0(hiddenDebt)+' excluded, '+noLimit.length+' card'+(noLimit.length===1?"":"s")+' with no limit'
        : "")+'</div></div>';

  const maxA=Math.max(...assets.map(a=>a.bal),0);
  document.getElementById("capAssets").textContent="Asset accounts by balance. Click one to filter everything below.";
  document.getElementById("assets").innerHTML=assets.length?assets.map((a,i)=>{
    const sel=state.account===a.id, dim=!sel&&!acctHasCat(a.id,state.category);
    return '<div class="row '+(sel?"sel":"")+' '+(dim?"dim":"")+'" data-acct="'+esc(a.id)+'">'+
      '<div class="row-top"><span class="row-name">'+esc(a.name)+' <span style="color:var(--muted)">· '+esc(a.src)+
      '</span></span><span class="row-val">$'+money(a.bal)+'</span></div>'+
      (a.bal>0?'<div class="track"><div class="fill" style="width:'+(maxA?a.bal/maxA*100:0).toFixed(1)+
        '%;background:'+RAMP[Math.min(i,4)]+'"></div></div>':'<div class="meta">Empty</div>')+'</div>';
  }).join(""):'<div class="empty">Nothing linked yet.</div>';

  const cats=spendByCategory(state.account), maxC=cats.length?cats[0].spent:0;
  document.getElementById("capCat").textContent=state.account
    ? "Spending inside "+byId[state.account].name+". Transfers excluded."
    : "Card payments and internal transfers excluded. Click a category to filter.";
  document.getElementById("cats").innerHTML=cats.length?cats.map((c,i)=>{
    const sel=state.category===c.cat;
    return '<div class="row '+(sel?"sel":"")+'" data-cat="'+esc(c.cat)+'">'+
      '<div class="row-top"><span class="row-name">'+esc(LABEL[c.cat]||c.cat)+' <span style="color:var(--muted)">· '+
      c.n+' transaction'+(c.n===1?"":"s")+'</span></span><span class="row-val">$'+money(c.spent)+'</span></div>'+
      '<div class="track"><div class="fill" style="width:'+(c.spent/maxC*100).toFixed(1)+
      '%;background:'+RAMP[Math.min(i,4)]+'"></div></div></div>';
  }).join(""):'<div class="empty">No spending in this selection.</div>';

  document.getElementById("capCards").textContent="Balance owed against the limit, where the issuer reports one.";
  document.getElementById("cards").innerHTML=cards.length?cards.map(a=>{
    const sel=state.account===a.id, dim=!sel&&!acctHasCat(a.id,state.category);
    const util=a.limit?a.bal/a.limit*100:null;
    const meta='<div class="meta">'+
      (a.limit?(a.bal===0?"Paid off":util.toFixed(1)+"% utilised"):"Limit not reported by issuer")+
      (a.manual?'<span class="badge">manual</span>':"")+'</div>';
    return '<div class="row '+(sel?"sel":"")+' '+(dim?"dim":"")+'" data-acct="'+esc(a.id)+'">'+
      '<div class="row-top"><span class="row-name">'+esc(a.name)+' <span style="color:var(--muted)">· '+esc(a.src)+
      '</span></span><span class="row-val">$'+money(a.bal)+
      (a.limit?' <span style="color:var(--muted);font-weight:400">of '+money0(a.limit)+'</span>':"")+'</span></div>'+
      '<div class="track">'+(a.bal>0&&a.limit?'<div class="fill" style="width:'+Math.max(util,0.4).toFixed(2)+
        '%;background:var(--debt)"></div>':"")+'</div>'+meta+'</div>';
  }).join(""):'<div class="empty">No cards linked.</div>';

  document.getElementById("capTx").textContent=on
    ? shown.length+" of "+TX.length+" transactions match the current filters."
    : "Transfers between your own accounts are dimmed and tagged.";
  document.getElementById("txwrap").innerHTML=shown.length?
    '<table><thead><tr><th>Date</th><th>Transaction</th><th>Account</th><th>Category</th>'+
    '<th style="text-align:right">Amount</th></tr></thead><tbody>'+
    shown.slice(0,200).map(t=>{
      const a=byId[t.account], x=XFER.has(t.category);
      const d=new Date(t.date+"T00:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"short"});
      const an=esc(a?a.name:"—"), cn=esc(LABEL[t.category]||t.category);
      return '<tr class="'+(x?"xfer":"")+'"><td>'+d+'</td><td class="name">'+esc(t.name)+
        (x?'<span class="tag">transfer</span>':"")+
        (t.pending?'<span class="tag pend">pending</span>':"")+
        '<span class="sub-meta">'+an+' · '+cn+'</span></td><td>'+an+'</td><td>'+cn+
        '</td><td class="num '+(t.amount<0?"neg":"pos")+'">'+
        (t.amount<0?"−":"+")+money(Math.abs(t.amount))+'</td></tr>';
    }).join("")+'</tbody></table>'
    :'<div class="empty">No transactions match these filters.</div>';

  document.getElementById("clearAssets").classList.toggle("on",!!state.account&&byId[state.account].type!=="credit card");
  document.getElementById("clearCards").classList.toggle("on",!!state.account&&byId[state.account].type==="credit card");
  document.getElementById("clearCat").classList.toggle("on",!!state.category);
  document.getElementById("clearTx").classList.toggle("on",!!on);

  const chips=[];
  if(state.account) chips.push('<span class="chip"><span style="color:var(--muted);font-size:11px">Account</span> '+
    esc(byId[state.account].name)+'<button data-clear="account">×</button></span>');
  if(state.category) chips.push('<span class="chip"><span style="color:var(--muted);font-size:11px">Category</span> '+
    esc(LABEL[state.category]||state.category)+'<button data-clear="category">×</button></span>');
  document.getElementById("filterbar").innerHTML=chips.length
    ? chips.join("")+'<button data-clear="all">Clear all</button>'
    : '<span>No filters. Click any row to filter.</span>';
}

const limModal=document.getElementById("limmodal");

function openLimits(){
  const cards=ACCOUNTS.filter(a=>a.type==="credit card");
  document.getElementById("limrows").innerHTML = cards.length ? cards.map(a=>{
    const src = a.manual ? "your figure"
      : a.reported!=null ? "reported by "+esc(a.src)
      : "not reported by "+esc(a.src);
    return '<div class="limrow"><div class="who"><div class="nm">'+esc(a.name)+'</div>'+
      '<div class="sb">$'+money(a.bal)+' owed · '+src+'</div></div>'+
      '<input type="number" min="1" step="100" placeholder="No limit" '+
      'value="'+(a.limit!=null?a.limit:"")+'" data-lim="'+esc(a.id)+'"></div>';
  }).join("") : '<div class="empty">No cards linked.</div>';
  document.getElementById("limstatus").textContent="";
  limModal.hidden=false;
  const f=limModal.querySelector("input"); if(f){f.focus();f.select();}
}
function closeLimits(){ limModal.hidden=true; }

async function saveLimits(){
  const inputs=[...limModal.querySelectorAll("[data-lim]")];
  const changed=[];
  for(const i of inputs){
    const a=byId[i.dataset.lim];
    const raw=i.value.trim();
    const next = raw==="" ? null : Number(raw);
    const now  = a.limit!=null ? Number(a.limit) : null;
    if(next!==now) changed.push({a, next});
  }
  if(!changed.length){ closeLimits(); return; }

  const status=document.getElementById("limstatus");
  status.textContent="Saving...";
  for(const {a,next} of changed){
    const res=await fetch("/api/limit",{method:"POST",headers:{"content-type":"application/json"},
      body:JSON.stringify({account_id:a.id, limit:next})});
    const body=await res.json().catch(()=>({}));
    if(!res.ok){ status.textContent="Failed on "+a.name+": "+(body.error||res.status); return; }
    a.manual = next!==null;
    // clearing hands the card back to whatever the issuer reports
    a.limit  = next!==null ? next : (a.reported!=null ? a.reported : null);
  }
  closeLimits(); render();
}

document.getElementById("limits").onclick=openLimits;
document.getElementById("limcancel").onclick=closeLimits;
document.getElementById("limsave").onclick=saveLimits;
limModal.addEventListener("click",e=>{ if(e.target===limModal) closeLimits(); });

document.addEventListener("click",e=>{
  const c=e.target.closest("[data-clear]");
  if(c){ const w=c.dataset.clear; if(w==="all") state={account:null,category:null}; else state[w]=null; return render(); }
  const r=e.target.closest("[data-acct],[data-cat]");
  if(r){
    if(r.dataset.acct) state.account = state.account===r.dataset.acct ? null : r.dataset.acct;
    else state.category = state.category===r.dataset.cat ? null : r.dataset.cat;
    return render();
  }
});

document.addEventListener("keydown",e=>{
  if(e.key==="Escape" && !document.getElementById("limmodal").hidden) closeLimits();
});

const tb=document.getElementById("theme");
tb.onclick=()=>{ const light=document.documentElement.getAttribute("data-theme")==="light";
  document.documentElement.setAttribute("data-theme",light?"dark":"light"); tb.textContent=light?"Light":"Dark"; };

document.getElementById("sync").onclick=async e=>{
  const btn=e.target, st=document.getElementById("status");
  btn.disabled=true; st.textContent="Syncing...";
  try{
    const res=await fetch("/sync/run",{method:"POST"});
    const body=await res.json();
    if(!res.ok) throw new Error(body.error||res.status);
    let msg=body.accounts+" accounts, "+body.transactions+" transactions.";
    if(body.errors&&body.errors.length) msg+=" Errors: "+body.errors.join("; ");
    st.textContent=msg+" Reloading...";
    setTimeout(()=>location.reload(),1200);
  }catch(err){ st.textContent="Failed: "+err.message; btn.disabled=false; }
};

render();
</script>
</body></html>`);
}

function loginPage(error) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Finance Overview</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/apple-touch-icon.png"><meta name="theme-color" content="#0f141b">
<style>
body{font-family:system-ui,sans-serif;background:#0b0f14;color:#e6e6e6;margin:0;
  height:100vh;display:flex;align-items:center;justify-content:center}
.card{background:#141a21;border:1px solid #232b34;border-radius:12px;padding:32px 40px;text-align:center;min-width:280px}
h1{font-size:18px;font-weight:500;margin:0 0 4px}
.sub{color:#8a8f98;font-size:13px;margin-bottom:24px}
.error{color:#e2716a;font-size:13px;margin-bottom:16px}
a.google{display:inline-flex;align-items:center;gap:10px;background:#fff;color:#1f1f1f;
  text-decoration:none;font-size:14px;font-weight:500;padding:10px 18px;border-radius:8px}
a.google:hover{background:#f1f1f1}
svg{width:18px;height:18px}
</style></head>
<body>
<div class="card">
  <h1>Finance Overview</h1>
  <div class="sub">Sign in to view your accounts</div>
  ${error ? `<div class="error">${esc(error)}</div>` : ""}
  <a class="google" href="/auth/google">
    <svg viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.9 32.5 29.4 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.2 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.2 29.5 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.3 0 10.1-2 13.7-5.4l-6.3-5.3C29.4 35.5 26.8 36 24 36c-5.3 0-9.8-3.5-11.4-8.3l-6.5 5C9.6 39.7 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.4-2.4 4.4-4.4 5.8l6.3 5.3C40.7 36.6 44 30.9 44 24c0-1.3-.1-2.7-.4-3.5z"/></svg>
    Sign in with Google
  </a>
</div>
</body></html>`;
}

/* ---------------------------------------------------------------- routing */

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(
      syncNow(env)
        .then((r) => console.log("Scheduled sync:", JSON.stringify(r)))
        .catch((err) => console.error("Scheduled sync failed:", err.message))
    );
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/auth/google" && request.method === "GET") return googleAuthRedirect(env, url);
    if (path === "/auth/callback" && request.method === "GET") return googleAuthCallback(env, request, url);

    if (path === "/logout" && request.method === "GET") {
      return new Response(null, { status: 302, headers: { location: "/", "set-cookie": sessionCookie("", 0) } });
    }

    // Icons are public assets, no session needed.
    if (path === "/favicon.svg") {
      return new Response(FAVICON_SVG, {
        headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=604800" }
      });
    }
    if (path === "/favicon.ico") {
      return new Response(null, { status: 301, headers: { location: "/favicon.svg" } });
    }
    if (path === "/apple-touch-icon.png" || path === "/apple-touch-icon-precomposed.png") {
      const bytes = Uint8Array.from(atob(TOUCH_ICON_B64), (c) => c.charCodeAt(0));
      return new Response(bytes, {
        headers: { "content-type": "image/png", "cache-control": "public, max-age=604800" }
      });
    }

    // Everything below needs a signed-in session.
    const session = await readSession(env, request);

    if (path === "/link" && request.method === "GET") {
      if (!session) return new Response(null, { status: 302, headers: { location: "/" } });
      return html(linkPage());
    }

    if (path === "/api/link/list" && request.method === "GET") {
      if (!session) return json({ error: "Not signed in" }, 401);
      const rows = await env.DB.prepare(
        "SELECT item_id, institution, added_at, last_error FROM plaid_items ORDER BY added_at"
      ).all();
      return json({ items: rows.results || [] });
    }

    if (path === "/api/link/token" && request.method === "POST") {
      if (!session) return json({ error: "Not signed in" }, 401);
      try {
        // Plaid rejects PII in client_user_id, so derive a stable opaque id
        // from the email rather than sending the address itself.
        const userId = (await hmac(env.SESSION_SECRET, `plaid-user:${session.e}`)).slice(0, 32);
        const body = await request.json().catch(() => ({}));

        const params = {
          user: { client_user_id: userId },
          client_name: "Finance Overview",
          country_codes: ["US"],
          language: "en"
        };

        // OAuth institutions (Chase, Capital One and others) bounce the user to
        // the bank's own site and back, which needs a registered redirect URI.
        if (env.PLAID_REDIRECT_URI) params.redirect_uri = env.PLAID_REDIRECT_URI;

        if (body.item_id) {
          // Update mode: re-authenticate an existing Item, for instance after a
          // 2FA challenge expired the session. products must be omitted here,
          // and the access_token does NOT change, so no exchange afterwards.
          const row = await env.DB.prepare("SELECT access_token FROM plaid_items WHERE item_id = ?")
            .bind(body.item_id).first();
          if (!row) return json({ error: "Unknown item" }, 404);
          params.access_token = row.access_token;
        } else {
          params.products = ["transactions"];
        }

        const r = await plaid(env, "/link/token/create", params);
        return json({ link_token: r.link_token, update: Boolean(body.item_id) });
      } catch (err) {
        return json({ error: err.message }, 502);
      }
    }

    if (path === "/api/link/exchange" && request.method === "POST") {
      if (!session) return json({ error: "Not signed in" }, 401);
      try {
        const { public_token } = await request.json();
        if (!public_token) return json({ error: "Missing public_token" }, 400);

        const ex = await plaid(env, "/item/public_token/exchange", { public_token });

        // Resolve a friendly institution name for the source column.
        let institution = "plaid";
        try {
          const item = await plaid(env, "/item/get", { access_token: ex.access_token });
          if (item.item && item.item.institution_id) {
            const inst = await plaid(env, "/institutions/get_by_id", {
              institution_id: item.item.institution_id,
              country_codes: ["US"]
            });
            institution = (inst.institution && inst.institution.name) || institution;
          }
        } catch {
          // Name lookup is cosmetic. Keep the connection either way.
        }

        await env.DB.prepare(
          `INSERT INTO plaid_items (item_id, access_token, institution, added_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(item_id) DO UPDATE SET
             access_token=excluded.access_token, institution=excluded.institution`
        ).bind(ex.item_id, ex.access_token, institution, new Date().toISOString()).run();

        return json({ ok: true, institution });
      } catch (err) {
        return json({ error: err.message }, 502);
      }
    }

    if (path === "/api/limit" && request.method === "POST") {
      if (!session) return json({ error: "Not signed in" }, 401);
      const body = await request.json().catch(() => ({}));
      const id = String(body.account_id || "");
      if (!id) return json({ error: "Missing account_id" }, 400);
      // null clears the override and hands the card back to whatever Plaid reports
      const raw = body.limit;
      let value = null;
      if (raw !== null && raw !== undefined && String(raw).trim() !== "") {
        value = Number(raw);
        if (!isFinite(value) || value <= 0) return json({ error: "Limit must be a positive number" }, 400);
      }
      const res = await env.DB.prepare("UPDATE accounts SET manual_limit = ? WHERE id = ?")
        .bind(value, id).run();
      if (!res.meta || res.meta.changes === 0) return json({ error: "Unknown account" }, 404);
      return json({ ok: true, limit: value });
    }

    // Unlink a connection: revoke it at Plaid, then delete its local rows.
    if (path === "/api/link/remove" && request.method === "POST") {
      if (!session) return json({ error: "Not signed in" }, 401);
      const body = await request.json().catch(() => ({}));
      const itemId = String(body.item_id || "");
      if (!itemId) return json({ error: "Missing item_id" }, 400);

      const row = await env.DB.prepare(
        "SELECT access_token, institution FROM plaid_items WHERE item_id = ?"
      ).bind(itemId).first();
      if (!row) return json({ error: "Unknown connection" }, 404);

      // Which accounts belong to this connection. Ask Plaid first, since rows
      // stored before item_id existed carry no link. Fall back to the column
      // when the token is already dead.
      let ids = [];
      try {
        const bal = await plaid(env, "/accounts/balance/get", { access_token: row.access_token });
        ids = bal.accounts.map((a) => a.account_id);
      } catch {
        const r = await env.DB.prepare("SELECT id FROM accounts WHERE item_id = ?").bind(itemId).all();
        ids = (r.results || []).map((x) => x.id);
      }

      // Revoke at Plaid so it stops refreshing. Note this does not free a slot
      // on the Trial plan.
      let revoked = true;
      try {
        await plaid(env, "/item/remove", { access_token: row.access_token });
      } catch {
        revoked = false;
      }

      for (let i = 0; i < ids.length; i += 40) {
        const c = ids.slice(i, i + 40);
        const ph = c.map(() => "?").join(",");
        await env.DB.prepare(`DELETE FROM transactions WHERE account_id IN (${ph})`).bind(...c).run();
        await env.DB.prepare(`DELETE FROM accounts WHERE id IN (${ph})`).bind(...c).run();
      }
      await env.DB.prepare("DELETE FROM plaid_items WHERE item_id = ?").bind(itemId).run();

      return json({ ok: true, institution: row.institution, accounts: ids.length, revoked });
    }

    if (path === "/sync/run" && request.method === "POST") {
      if (!session) return json({ error: "Not signed in" }, 401);
      try {
        return json(await syncNow(env));
      } catch (err) {
        return json({ error: err.message }, 502);
      }
    }

    if (path === "/" && request.method === "GET") {
      if (!session) return html(loginPage(url.searchParams.get("error")));
      return handleDashboard(env, session.e);
    }

    return new Response("Not found", { status: 404 });
  }
};
