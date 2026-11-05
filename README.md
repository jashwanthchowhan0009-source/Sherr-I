<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.jpg">
    <img src="assets/logo-light.png" alt="Sherr I logo" width="180">
  </picture>
</p>

<h1 align="center">Sherr I</h1>

<p align="center">
  WhatsApp pe chalne wala personal + family assistant, by <b>SherrByte</b>.<br>
  Bolo (text ya voice note), aur kaam ho jaaye.
</p>

**Abhi kya kar sakta hai (MVP):**
- ⏰ Reminders: one-time ya daily (*"Kal 7 baje gym yaad dilana"*)
- 👨‍👩‍👧 Family mode: *"Papa ko roz 9 baje BP tablet yaad dilana"* → Sherr I Papa ko unki bhasha mein WhatsApp karta hai
- ✅ Papa reply karein → tujhe update. 30 min tak reply nahi → tujhe nudge
- 🎙️ Voice notes samajhta hai (Telugu / Hindi / English / mix)
- 🔒 Privacy: sirf Meta ke signed webhooks accept, chat history 30 din baad auto-delete

## Stack (100% free)

| Part | Kya | Free tier |
|---|---|---|
| Channel | WhatsApp Cloud API (Meta, direct) | Test number free |
| Server | Cloudflare Workers | 100k requests/din |
| Database | Cloudflare D1 (SQLite) | 5 GB |
| Scheduler | Cron Triggers (har minute) | Free, kabhi pause nahi hota |
| AI | Gemini `gemini-2.5-flash` | Free tier |

```
WhatsApp ──► /webhook ──► Gemini (tools) ──► D1
                ▲                              │
  cron (1 min) ─┴─► reminders ──► WhatsApp ◄───┘
```

## Setup (~20 min)

### 1. Keys le aa

**Meta / WhatsApp** ([developers.facebook.com](https://developers.facebook.com)):
1. **Create App** → type **Business** → **WhatsApp** add kar
2. **WhatsApp → API Setup** se copy kar: **Phone number ID** + **Access token**
3. Wahi page pe **"To"** mein apna aur Papa ka number add kar (test number max 5 numbers ko bhej sakta hai)
4. **App settings → Basic** se **App Secret** copy kar
5. **Template** bana (WhatsApp Manager → Message templates): name `sherr_update`, category **Utility**,
   language **English**, body `Sherr I update: {{1}}`. 24 ghante baad reminders bhejne ke liye zaroori hai.
6. Profile photo: `assets/logo-dark.jpg`

**Gemini:** [aistudio.google.com/apikey](https://aistudio.google.com/apikey) se free key.

> ⚠️ Gemini free tier ka data Google training mein use kar sakta hai. Testing ke liye theek.
> **Real users se pehle paid key** (ya Claude API; sirf `src/gemini.ts` badlo).

### 2. Ek command se deploy
Free [Cloudflare account](https://dash.cloudflare.com/sign-up) bana, phir:
```bash
git clone https://github.com/jashwanthchowhan0009-source/Sherr-I.git
cd Sherr-I
npm install
npm run setup
```
Script khud: login karayega → database banayega → tables → deploy → keys poochega →
end mein **Webhook URL + Verify token** dikhayega.

### 3. Webhook connect kar
Meta → **WhatsApp → Configuration → Webhook → Edit**:
- Callback URL + Verify token: setup script ne jo diya
- **Manage** → `messages` subscribe kar

### 4. Try kar 🔥
Test number pe WhatsApp kar:
1. `Hi`
2. `Papa ka number 98xxxxxxxx hai, unse Telugu mein baat karna`
3. Papa test number ko `Hi` bhejein (WhatsApp ka opt-in rule)
4. `Papa ko roz subah 9 baje BP tablet yaad dilana`

## Dev
```bash
npm test          # unit tests
npm run test:e2e  # full flow locally (mock WhatsApp + Gemini, real Worker + D1)
npm run check     # type check
npm run logs      # live logs from Cloudflare
```

Settings (template name, model, allowed numbers) → `wrangler.toml` ke `[vars]` mein, phir `npm run deploy`.

## Files
```
src/
  index.ts       entry: /webhook + cron
  webhook.ts     incoming messages, family opt-in, reply → owner update
  reminders.ts   due reminders, 30-min nudges, 30-day cleanup
  brain.ts       system prompt + tools (naye features yahan)
  gemini.ts      AI client (Claude pe switch yahan)
  whatsapp.ts    send text/template, voice note download
  db.ts          D1 queries
  util.ts        pure helpers (tested)
  i18n.ts        Telugu/Hindi/... fixed lines
migrations/      D1 tables
scripts/setup.sh one-time setup
tests/           unit + end-to-end
```

## Limits (MVP)
- Sirf IST time zone.
- Test number sirf 5 verified numbers. Public launch ke liye Meta Business verification + apna number.
- DPDP Act: launch se pehle privacy policy + consent flow (CA/lawyer se check karwa lena).

## Next ideas
- Google Calendar / Gmail tools
- Bijli bill, gas booking reminders
- Medical History app ke saath health records connect
- Voice replies (text-to-speech)
