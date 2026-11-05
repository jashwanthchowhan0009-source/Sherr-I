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
- 🔒 Privacy: RLS on, sirf server access; chat history 30 din baad auto-delete; Meta signature verified webhook

## Stack (sab free tier)

| Part | Kya | Cost |
|---|---|---|
| Channel | WhatsApp Cloud API (Meta, direct) | Test number free |
| Backend | Supabase Edge Functions | Free |
| Database | Supabase Postgres (RLS on) | Free |
| Scheduler | pg_cron (har minute) | Free |
| AI | Gemini (`gemini-2.5-flash`) | Free tier |

```
WhatsApp ──► whatsapp-webhook (Edge Function) ──► Gemini (tools) ──► Postgres
                      ▲                                                  │
pg_cron (1 min) ──► send-reminders (Edge Function) ──► WhatsApp ◄────────┘
```

## Setup (≈30 min)

### 1. Supabase
1. [supabase.com](https://supabase.com) pe naya project bana (region: Mumbai).
2. Supabase CLI install kar aur link kar:
   ```bash
   npm i -g supabase
   supabase login
   supabase link --project-ref YOUR-PROJECT-REF
   supabase db push          # tables bana dega
   ```

### 2. Meta / WhatsApp
1. [developers.facebook.com](https://developers.facebook.com) → **Create App** → type **Business** → **WhatsApp** add kar.
2. **WhatsApp → API Setup** se copy kar: **Phone number ID** aur **temporary access token**
   (baad mein System User se permanent token bana lena).
3. Test number se apna number **"To"** list mein add kar (max 5 numbers). Papa ka bhi add kar.
   Profile photo ke liye `assets/logo-dark.jpg` lagao (WhatsApp Manager → Phone numbers → Profile).
4. **App settings → Basic** se **App Secret** copy kar.
5. **Message template** bana (WhatsApp Manager → Templates): name `sherr_update`, category **Utility**,
   language **English**, body: `Sherr I update: {{1}}`. Yeh 24h window ke baad reminders bhejne ke liye zaroori hai.

### 3. Gemini key
[aistudio.google.com](https://aistudio.google.com/apikey) se free API key le.

> ⚠️ Gemini free tier ka data Google product improve karne mein use kar sakta hai.
> Testing ke liye theek hai. **Real users se pehle paid key use kar** (ya Claude API pe switch kar, `_shared/gemini.ts` badlo).

### 4. Secrets + deploy
```bash
cp .env.example .env      # values bhar
supabase secrets set --env-file .env
supabase functions deploy whatsapp-webhook
supabase functions deploy send-reminders
```

### 5. Webhook connect kar
Meta → **WhatsApp → Configuration → Webhook**:
- Callback URL: `https://YOUR-PROJECT-REF.supabase.co/functions/v1/whatsapp-webhook`
- Verify token: jo `WHATSAPP_VERIFY_TOKEN` mein daala
- Subscribe: **messages**

### 6. Reminders ka cron
Supabase **SQL Editor** mein `supabase/sql/cron.sql` khol, 2 placeholder values bhar, run kar.

### 7. Try kar 🔥
Test number pe WhatsApp kar:
1. `Hi`
2. `Papa ka number 98xxxxxxxx hai, unse Telugu mein baat karna`
3. Papa test number ko `Hi` bhejein (WhatsApp ka opt-in rule)
4. `Papa ko roz subah 9 baje BP tablet yaad dilana`

## Dev
```bash
deno task test    # unit tests
deno task check   # type check
```

Logs: Supabase Dashboard → Edge Functions → Logs.

## Files
```
supabase/
  migrations/…_init.sql      tables + RLS
  sql/cron.sql               pg_cron jobs (run once)
  functions/
    whatsapp-webhook/        incoming messages, family opt-in, replies
    send-reminders/          due reminders + 30-min nudges
    _shared/
      brain.ts               system prompt + tools (yahan naye features add karo)
      gemini.ts              AI client (swap to Claude here)
      whatsapp.ts            send text/template, download voice notes
      util.ts                pure helpers (tested)
      i18n.ts                fixed lines in Telugu/Hindi/…
tests/                       deno tests
```

## Limits (MVP)
- Sirf IST time zone.
- Test number sirf 5 verified numbers ko message kar sakta hai. Public launch ke liye Meta Business verification + apna number.
- DPDP Act: launch se pehle privacy policy + consent flow add karna (CA/lawyer se check karwa lena).

## Next ideas
- Google Calendar / Gmail tools
- Bijli bill, gas booking reminders
- Medical History app ke saath health records connect
- Voice replies (text-to-speech)
