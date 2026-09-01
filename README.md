# Foliq

AI-written personal portfolio sites. Tell it your name + a few details,
it researches you, writes and designs your site, and you can drag-and-drop
edit it before publishing to a shareable link.

**Name:** Foliq — short (5 letters), easy to say, fits under 8 characters
for `foliq.vercel.app`, and reads as "folio" + "IQ" (a nod to the AI
writing it). Worth checking whether `foliq.com` is available before you
commit to it long-term — you can always point a custom domain at the
Vercel project later without changing anything in the code.

---

## 1. Create the Supabase project & table

1. Create a project at [database.new](https://database.new) (or use an existing one).
2. Open **SQL Editor → New query**, paste in the contents of [`sql/schema.sql`](./sql/schema.sql), and run it.
   This creates the single `portfolios` table plus Row Level Security policies:
   - Owners can read/update/delete only their own rows.
   - Anyone (including logged-out visitors) can **read** a row once `published = true` — that's what powers the public portfolio page.
   - Nobody can write a row that isn't theirs.
3. Go to **Settings → API Keys**. You already have a publishable key:
   ```
   sb_publishable_WciVAE3r35hMRLtZ_rjn5w_3D7lpYFY
   ```
   Grab your **Project URL** too (Settings → API → Project URL, looks like `https://xxxxxxxx.supabase.co`).
4. Go to **Authentication → URL Configuration** and set:
   - **Site URL** → `https://<your-vercel-domain>`
   - **Redirect URLs** → add `https://<your-vercel-domain>/dashboard` (and `http://localhost:3000/dashboard` if you'll test locally with `vercel dev`).
   This is required for the magic-link email login to redirect back to the right place. The Email provider is enabled by default — no password auth is used anywhere in this app.

## 2. Set environment variables in Vercel

In your Vercel project → **Settings → Environment Variables**, add:

| Name | Value |
|---|---|
| `SUPABASE_URL` | your Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_WciVAE3r35hMRLtZ_rjn5w_3D7lpYFY` |
| `GEMINI_API_KEY` | your Gemini API key |
| `SEARCHAPI_API_KEY` | your SearchAPI.io API key |

Only `api/config.js` ever reads `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` and hands them to the browser (the publishable key is designed to be public — RLS is what actually protects your data). `GEMINI_API_KEY` and `SEARCHAPI_API_KEY` never leave the server.

## 3. Deploy

Push this folder to a GitHub repo and import it in Vercel, or run:

```bash
npm i -g vercel
vercel
```

No build step is required — it's static HTML/CSS/JS plus three serverless
functions in `/api`. Vercel auto-detects the Node.js functions.

## How it's wired together

- **`index.html`** — landing page.
- **`login.html`** — email-only login via Supabase Auth (`signInWithOtp`, a.k.a. magic link).
- **`dashboard.html`** — lists the signed-in user's portfolios (draft or published).
- **`onboarding.html`** — collects name + age (required) and optional extras, then calls `/api/enrich` → `/api/generate` and saves a draft row directly to Supabase (client-side insert, protected by RLS).
- **`api/enrich.js`** — server-side call to SearchAPI.io's Google engine to gather a few public snippets about the person. Fails soft (returns empty results) if the key is missing or the request errors, so generation still works.
- **`api/generate.js`** — server-side call to **Gemini 3.7 Flash** (`thinkingConfig.thinkingLevel: "medium"`) with a strict `responseSchema`, so Gemini only ever returns clean JSON (name/tagline/sections/items/theme) — it never writes HTML, CSS, or JS.
- **`render.js`** — the shared template engine. Turns that JSON into the actual portfolio markup, theme CSS (6 themes), and the fade-in/fade-out trigger runtime. Used identically by the preview iframe, the editor canvas, and the public portfolio page, so what you see while editing is exactly what gets published.
- **`preview.html`** — shows the freshly generated site and lets you Publish or jump into the editor.
- **`editor.html`** — the no-code visual builder: drag to reorder sections in the left sidebar, click any element in the canvas to edit its text inline or assign a fade-in/fade-out trigger with a delay in the right-hand inspector, switch between the **Edit** and **Preview** tabs at the top, and Save or Publish when you're happy.
- **`portfolio.html`** — the public page, rendered from `?name=<slug>`, reading the row directly from Supabase (allowed by the "anyone can read published portfolios" policy).
- **`api/config.js`** — the only bridge between the static pages and your Supabase credentials.

## Known simplifications (good next steps)

- Triggers (fade-in/fade-out + delay) apply at the hero, about, section, and item level — not per individual word or tag.
- Tags on project/experience items and section reordering happen through the sidebar/inspector, not by dragging within the canvas itself.
- There's no image upload yet — everything is text-based, matching the "no code needed" JSON contract Gemini writes to.
