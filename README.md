# Sentiment Analyzer — call intelligence

Upload a `.txt` call transcript. Get back overall sentiment, sentence-level
sentiment, emotion detection, a call-centre KPI board, and a summary — with
**every model judgement backed by a verbatim quote that the system checks
against the transcript before you see it.**

```
Next.js  ──►  n8n  ──►  Gemini  ──►  quality gate  ──►  dashboard
 login         auth      structured    evidence          evidence
 upload        validate  JSON output   verification      explorer
 dashboard     normalise               coverage /        KPI board
               parse                   grounding         transcript
               KPI engine
```

---

## The three decisions that shape this build

**1. Every judgement is a claim, not a number.** Each KPI is
`{ value, status, confidence, reason, evidence[] }`. `escalation_risk: 0.87` is
unfalsifiable; *0.87, because the customer twice asked for a supervisor, here
are the two quotes* can be checked — and it is checked.

**2. "I can't tell from this transcript" is a correct answer.** A claim can come
back `status: "insufficient_evidence"` with a null value, and the dashboard
renders that as **N/A** with the reason. A sales-negotiation transcript has no
resolution status; inventing 0.5 to fill the tile would be worse than an honest
gap.

**3. The model is a probabilistic component, not a truth engine.** Nothing it
returns reaches the dashboard untested. Every cited quote is string-matched back
against the turn it claims to come from; quotes that do not exist are counted as
fabrications, shown in the UI with a red cross, and — above a threshold — fail
the analysis and trigger one **corrective retry** with the specific failures
quoted back to the model.

---

## Quick start

```bash
npm install
cp .env.example .env.local        # set AUTH_*, GOOGLE_*, N8N_WEBHOOK_URL
npm run dev                       # http://localhost:3000
```

Sign in with **Continue with Google** (when `GOOGLE_CLIENT_ID` is set), create an
account at `/signup`, or use `AUTH_USERNAME` / `AUTH_PASSWORD`, then drop in a
`.txt` transcript or click one of the three bundled samples.

### Google OAuth setup

1. Create an OAuth 2.0 **Web application** client in [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
2. Add an **Authorized JavaScript origin** (required for Continue with Google):
   ```
   http://localhost:3000
   ```
3. Add an **Authorized redirect URI** (legacy code-exchange fallback):
   ```
   http://localhost:3000/api/auth/callback/google
   ```
4. Copy the client ID into `.env.local`. The client secret is optional for the
   popup sign-in path:
   ```
   GOOGLE_CLIENT_ID=....apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-...
   GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/callback/google
   ```
5. Restart `npm run dev`.

Analysis is **always** `UI → n8n → Gemini`. Set `N8N_WEBHOOK_URL` to the
imported workflow (or `npm run n8n:simulate` for local plumbing). The Gemini
API key lives in n8n credentials, not in Next.js. The header chip shows
whether the webhook is configured.

### Run everything the CI would

```bash
npm run check      # typecheck + workflow verification + 61 unit tests
```

### Exercise the n8n path with no n8n instance and no API key

```bash
npm run n8n:simulate &            # runs the real Code stages, stubs the model
N8N_WEBHOOK_URL=http://localhost:5678/webhook/sentiment-analyze \
N8N_WEBHOOK_SECRET=local-dev npm run dev
```

`scripts/simulate-n8n.mjs` loads the generated workflow JSON, walks its
connection graph, and executes each Code node's **real source** in a sandbox —
authentication, validation, the conversation parser, the evidence verifier, the
quality gate, and the KPI engine. Only the Gemini HTTP call is substituted. It deliberately plants
one fabricated quote so you can watch the gate catch it.

---

## Architecture

### One contract, three consumers

The prompt, the output JSON Schema and the evidence-matching rules live in
`src/contract/` as plain ESM, imported by everything that needs them:

| File | Imported by |
|---|---|
| `analysis-contract.mjs` | the app (`src/lib/prompt.ts`), the workflow generator |
| `evidence-check.mjs` | the app (`src/lib/verify.ts`), the workflow generator |

`n8n/sentiment-analyzer.workflow.json` is **generated**, not hand-written
(`npm run build:workflow`, which also runs as part of `npm run build`). The
system prompt, the schema and the matcher are baked in from those files rather
than retyped, so the app and the workflow cannot drift. `npm run
verify:workflow` asserts that byte-for-byte, and additionally:

- every Code node parses as JavaScript,
- every connection resolves and every node is reachable,
- every gate wires **both** its true and false output (an unwired false branch
  means a rejected request hangs with no response),
- the inlined matcher still separates a real quote from a fabricated one — run
  as a live behavioural probe, because a matcher that returned "verified" for
  everything would pass every structural check and be worthless.

### The n8n pipeline

One node per responsibility, so opening the workflow shows the architecture:

| Stage | Does |
|---|---|
| **Webhook** | `POST /webhook/sentiment-analyze` |
| **Authenticate** | shared-secret check against `N8N_WEBHOOK_SECRET` |
| **Validate input** | shape, size, types — a bad payload never costs a token |
| **Normalise & parse** | control characters, turn array, speaker roster |
| **Build Gemini request** | system prompt + JSON schema + user prompt |
| **Gemini** | HTTP `generateContent`, structured JSON, `neverError` so a 4xx becomes a structured error |
| **Parse & schema-validate** | unwrap, `JSON.parse`, contract check |
| **Verify evidence** | every quote matched against the turn it cites |
| **KPI engine** | deterministic talk-ratio / word / question stats |
| **Quality gate** | coverage / grounding / support scoring and a verdict |
| **Format response** | `{ analysis, quality, diagnostics }` |

Every gate's false branch routes to a Respond node that returns a real HTTP
status (401 / 400 / 413 / 422 / 502), because the app's fetch layer distinguishes
them.

### Why there is no Next.js → Gemini path

`src/lib/analyzer.ts` posts the transcript to the n8n webhook and nothing else.
If `N8N_WEBHOOK_URL` is unset, analysis returns 503 rather than calling Gemini
from the app. That is the assignment architecture: **n8n is the orchestrator,
Gemini is the analyst, Next.js is the product.** Local demo without n8n uses
`npm run n8n:simulate`, which still runs the real Code stages.

---

## The quality gate

`src/lib/verify.ts` answers five questions the dashboard would otherwise take on
faith:

| Check | Question |
|---|---|
| `turnCoverage` | did every transcript turn come back with a label? |
| `phantomTurns` | did the model invent turns that do not exist? |
| `evidenceCoverage` | does every answered claim cite evidence? |
| `evidenceGrounding` | does that evidence actually appear in the transcript? |
| `abstentions` / `lowConfidenceClaims` | where did it decline or hedge? |

**Grounding is the load-bearing one.** `evidence-check.mjs` normalises away the
differences that are not fabrications — smart quotes, dash variants, ellipses,
casing, whitespace — and keeps everything else, so a paraphrase is still caught.
Four outcomes:

| Verdict | Meaning |
|---|---|
| `exact` | found verbatim in the cited turn |
| `moved` | found verbatim in a *different* turn — real quote, wrong citation; the citation is **corrected**, not discarded |
| `fuzzy` | matched at ≥ 90% in-order token coverage; accepted and flagged |
| `missing` | not in the transcript at all — a fabrication |

**Abstentions are not penalised.** Declining to answer an unanswerable question
is the behaviour this system wants, so scoring it down would train the wrong
thing.

**The retry is a correction, not a re-roll.** When the gate fails on something a
re-run can fix, the failing checks are fed back as specific feedback — which
turn indices are unlabelled, which quotes could not be found — and the second
attempt is asked to fix exactly those.

---

## The KPI framework

Grouped the way a call reviewer reads them. Every one is a claim, and every one
can abstain.

**Customer** — sentiment · frustration · effort (how much work they had to do)
· satisfaction · predicted CSAT · likely NPS · escalation intent · churn risk

**Agent** — sentiment · empathy · professionalism · responsiveness · active
listening · ownership · resolution effectiveness

**Conversation** — resolution status · first-contact resolution · escalation
risk · urgency · issue category · topics · compliance checks

**Conversation dynamics — computed, never inferred** — talk ratio · sentiment
shift (opening → closing) · volatility · turns · estimated duration · questions
asked · per-speaker word counts, question counts and mean sentiment.

That last group is the reason every tile carries a **`Computed`** or
**`Inferred`** stamp. Talk ratio is arithmetic; churn risk is a judgement.
Rendering them identically would be the most misleading thing this dashboard
could do. Where both exist — customer and agent sentiment — the dashboard prints
the model's claim *and* the computed mean side by side, so a disagreement is
visible rather than reconciled away.

### Escalation intent vs escalation risk

Not the same KPI. Intent is what the customer asked for; risk is what we expect
to happen. A customer can threaten an ombudsman on a call the agent then
recovers.

---

## The dashboard

Reading order is deliberate: verdict and distribution (what happened) → timeline
(how it moved) → KPI board (what it means) → emotion and speakers → narrative
panels → **quality gate** → transcript. A reviewer reading top to bottom ends on
the caveats rather than starting there.

**Audit mode.** Every inferred tile has a *Why?* disclosure showing the reason,
the supporting and contradicting signals, and each quote with a green tick or a
red cross for whether verification found it. Quote turn-references are clickable
and scroll the transcript to that turn.

### Charts

Hand-built SVG rather than a chart library, so the marks match the spec exactly
(2px lines, 4px rounded data-ends anchored to the baseline, a 2px surface gap
between fills, ≥8px hit targets). Every chart has a hover tooltip, a legend, and
a **data table view** behind a disclosure.

- **Sentiment timeline** — diverging columns, one per turn. Columns rather than
  a line because turns are discrete events; a line would draw an interpolation
  between turn 4 and turn 5 that never happened. A 2px rolling mean carries the
  trend the columns only imply, and key moments are marked above the plot.
- **Distribution donut** — defensible only because there are exactly three
  mutually exclusive parts summing to the whole, and the hole carries the
  headline number.
- **Emotion mix** — horizontal bars, not a radar: the categories are unordered,
  and a radar's shape would depend on the arbitrary order of its axes.
- **Speaker split** — talk share above sentiment mix, on separate rows rather
  than a dual axis.

### Colour

The palette is validated, not chosen by eye — lightness band, chroma floor,
colour-vision-deficiency separation, normal-vision separation and
contrast-vs-surface all checked with a script.

**Sentiment uses a diverging blue ↔ red scale over a grey midpoint, not the
conventional green ↔ red.** Green vs red measured ΔE 5.1 under deuteranopia
simulation — a fail. Blue vs red measures 8.7. Every sentiment colour is also
paired with a text label and a glyph (▲ ■ ▼), so colour never carries the
meaning alone. Emotions use a fixed six-slot categorical order, assigned by
position and never cycled; a seventh emotion folds into "Other" rather than
getting an invented hue.

Light and dark are both explicitly stepped for their own surface, driven by a
single `data-theme` attribute set before first paint.

---

## Evaluation

`/evaluation` runs three hand-labelled transcripts through the **real** pipeline
— same prompt, same orchestration, same gate — and reports what happened.

The page states plainly what it is: three transcripts is a smoke-test set, not a
benchmark. It cannot support an accuracy claim, and the transcripts were written
alongside the prompt so it cannot measure generalisation either. What it catches
is regressions in the behaviours that must not break:

| Fixture | Exists to catch |
|---|---|
| Billing escalation | sentiment calibration softening on an unambiguously negative call |
| Delivery recovery | a verdict that averages an arc away to neutral instead of following it |
| SaaS renewal | **the abstention test** — a model that reports a resolution status on a call that has no support issue is inventing one |

Labels are ranges and acceptable sets, not exact values: *"escalation risk is
high on a call ending with an ombudsman threat"* is a fact; *"escalation risk is
0.78"* is not.

Grounding, coverage and abstention counts on that page are **measured** by the
verification layer and are meaningful on any transcript. The pass/fail checks
are measured against those labels only.

---

## Testing

```bash
npm test     # 61 tests
```

Covers the parser (six real transcript shapes, prose fallback, speaker
classification), the deterministic metrics (talk ratio, arc, distribution,
per-role sentiment, determinism), schema normalisation (clamping, enum
fallback, null-with-abstention), the evidence matcher (exact / moved / fuzzy /
missing / paraphrase-rejection), the quality gate (fabrication detection,
missing turns, phantom turns, unsupported claims, abstention accounting,
citation correction), and the **full post-model pipeline over all three real
sample transcripts**.

Two real bugs were found by these tests while writing them and are now
regression-covered: the bracketed `[Customer] text` speaker form failed to
parse, and `"customer"` contains `"me"` — an agent hint — so naive substring
matching classified every customer as the agent.

---

## Configuration

See `.env.example`. The essentials:

| Variable | Purpose |
|---|---|
| `AUTH_USERNAME` / `AUTH_PASSWORD` | demo login (`analyst` / `change-me`) |
| `GOOGLE_CLIENT_ID` | enables Continue with Google |
| `AUTH_SECRET` | HMAC key for the session cookie — **required in production** |
| `N8N_WEBHOOK_URL` | **required** — route every analysis through n8n |
| `N8N_WEBHOOK_SECRET` | shared secret sent as `x-api-key` |

The Gemini API key is **not** an app env var. It is an n8n Header Auth
credential.

### n8n setup

1. Import `n8n/sentiment-analyzer.workflow.json`.
2. Create a **Header Auth** credential named `Gemini API`: name
   `x-goog-api-key`, value your Gemini API key. Attach it on the
   **Gemini — analyse call** node if import did not map it.
3. Optionally set `N8N_WEBHOOK_SECRET` (and `GEMINI_MODEL`) in n8n
   **Variables** (Cloud) or environment (self-hosted).
4. Toggle the workflow **Active**. Copy the Webhook node's **Production URL**
   (not the Test URL) — it looks like
   `https://<instance>.app.n8n.cloud/webhook/sentiment-analyze`.

### Deployment (Vercel)

The app on Vercel and the n8n workflow are two services. Combining them is
one environment variable:

1. Vercel → Settings → Environment Variables (Production), then **Redeploy**:

   | Variable | Value |
   |---|---|
   | `N8N_WEBHOOK_URL` | Production URL from the n8n Webhook node |
   | `N8N_WEBHOOK_SECRET` | same string as in n8n, if you set one |
   | `AUTH_SECRET` | `openssl rand -base64 32` — login fails without this |
   | `MONGODB_URI` / `MONGODB_DB` | Atlas, if you want history |
   | `GOOGLE_CLIENT_ID` | Continue with Google |

   Do **not** set `N8N_WEBHOOK_URL` to `localhost`. Vercel cannot reach your
   laptop. Do **not** put `GEMINI_API_KEY` on Vercel — it belongs in n8n.

2. Atlas → Network Access: allow Vercel (`0.0.0.0/0` is fine for a demo).
3. Google Cloud OAuth: add `https://<your-app>.vercel.app` as an Authorized
   JavaScript origin.

The analysis route declares `maxDuration = 300`. A long transcript can take
30–90 seconds, so a plan with a matching function timeout is needed. Confirm
wiring with `GET /api/status` (`n8n` must be `true`).

---

## Security

- Session is an HMAC-SHA256-signed, HttpOnly, SameSite=Lax cookie with an
  expiry. Written against Web Crypto only, so the identical verification runs in
  Edge middleware and in Node route handlers — one implementation, no drift.
- Credential comparison is constant-time, and both username and password are
  always compared so a wrong username costs the same as a wrong password.
- Login is rate-limited per IP.
- Unauthenticated API requests get a 401 JSON body rather than a redirect to an
  HTML page.
- `/samples` is deliberately public — non-sensitive fixtures, and the evaluation
  route fetches them server-side with no cookie. It also refuses to analyse a
  response that looks like HTML, in case that is ever misconfigured.
- Uploads: `.txt` only, 400 KB cap, BOM and control characters stripped.
- Transcripts are held only for the lifetime of the request. Nothing is written
  to disk or to a database.

---

## Known limits

- **Duration is an estimate**, derived from word count at 140 wpm, and is
  labelled as such. A text transcript carries no timing.
- **Speaker roles are inferred** from name hints, falling back to position (the
  first speaker greets → agent). Wrong on a transcript where the customer speaks
  first; the roster is shown to the model, which may override it.
- **No diarisation.** A transcript without speaker prefixes falls back to
  sentence segmentation and per-speaker KPIs become meaningless — the model is
  told to abstain on them.
- The **evaluation set is three transcripts**, and the page says so.
- The corrective retry runs **once**. Beyond that the failure is not the kind a
  re-run fixes.
