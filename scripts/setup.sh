#!/usr/bin/env bash
# One-time setup for Sherr I on Cloudflare (free plan).
# Run from the repo root:  npm install && npm run setup
set -euo pipefail

W="npx wrangler"

echo "🐯 Sherr I setup"
echo

# 1) Login
if ! $W whoami >/dev/null 2>&1; then
  echo "→ Cloudflare login (browser khulega)"
  $W login
fi

# 2) Database
if grep -q "REPLACE_WITH_YOUR_D1_ID" wrangler.toml; then
  echo "→ Creating D1 database 'sherr-i'"
  out=$($W d1 create sherr-i 2>&1) || { echo "$out"; exit 1; }
  id=$(echo "$out" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)
  if [ -z "$id" ]; then echo "$out"; echo "❌ D1 id nahi mila, upar ka output dekh"; exit 1; fi
  sed -i.bak "s/REPLACE_WITH_YOUR_D1_ID/$id/" wrangler.toml && rm -f wrangler.toml.bak
  echo "  database_id = $id"
fi

echo "→ Creating tables"
$W d1 migrations apply sherr-i --remote

# 3) Deploy
echo "→ Deploying worker"
$W deploy

# 4) Secrets
echo
echo "→ Ab secrets daal (paste karke Enter). Kahan milenge: README dekh."
for s in WHATSAPP_ACCESS_TOKEN WHATSAPP_PHONE_NUMBER_ID WHATSAPP_APP_SECRET GEMINI_API_KEY; do
  echo
  echo "[$s]"
  $W secret put "$s"
done

VERIFY=$(openssl rand -hex 16 2>/dev/null || date +%s%N | sha256sum | cut -c1-32)
echo "$VERIFY" | $W secret put WHATSAPP_VERIFY_TOKEN >/dev/null

SUB=$($W whoami 2>/dev/null | grep -oE '[a-z0-9-]+\.workers\.dev' | head -1 || true)
echo
echo "✅ Done! Ab Meta → WhatsApp → Configuration → Webhook mein daal:"
echo
echo "   Callback URL : https://sherr-i.${SUB:-<your-subdomain>.workers.dev}/webhook"
echo "   Verify token : $VERIFY"
echo
echo "   (URL 'npx wrangler deploy' ke output mein bhi dikhta hai)"
echo "   Subscribe field: messages"
