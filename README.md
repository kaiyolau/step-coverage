# Manual-to-Automation Step Coverage

**Live demo: https://kaiyolau.github.io/step-coverage/**

A single-page tool for QA teams. Paste your **manual test cases** and a **Playwright spec file**, and it shows, step by step, which manual steps are already automated and which ones a human still has to test by hand.

> Matching is keyword-based and approximate. It is a hint to help you decide what to test by hand, not proof of coverage.

The page opens with sample data already loaded, so you can see every feature right away.

## Features

- Per manual step status: **COVERED**, **PARTIAL** (clicked but never verified), **NOT COVERED**, **NEEDS HUMAN JUDGMENT**
- "Still needs manual testing" list with **Copy as checklist** (Markdown)
- Coverage % per case and overall, with progress bars
- "Matched by" column: the Playwright line that matched, its line number, and the shared keywords
- Pick a different Playwright test for any case, or choose "No automated test"
- Threshold slider to tune matching live
- Optional AI helpers (bring your own Anthropic API key), see below

## Run locally

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # Vitest unit tests
npm run build    # type-check + production build into dist/
```

## Input format

### Manual test cases

```text
TC-1: Login with valid credentials
1. Navigate to /login | Expected: Login form is displayed
2. Enter email and password
3. Click Sign in
Expected: User is redirected to /dashboard
```

- A case starts with `TC-<id>: <title>` or `# <title>`.
- Steps are numbered lines (`1.` or `1)`).
- The expected result is optional. Put it after ` | Expected:` on the same line, or on the next line starting with `Expected:`.
- Many cases can go in one text.

### Playwright file

Paste a normal `.spec.ts` file. The parser uses regex and simple string scanning (no AST):

- Finds every `test('title', async ({ page }) => { ... })` block (also inside `test.describe`).
- **Actions:** `goto`, `click`, `dblclick`, `fill`, `type`, `press`, `check`, `uncheck`, `selectOption`, `hover`, `setInputFiles`.
- **Assertions:** any `expect(...).toXxx(...)` / `expect(...).not.toXxx(...)`.
- Keeps the locator text (`getByRole`, `getByLabel`, `getByText`, `getByTestId`, `getByPlaceholder`, `locator`) and every string or regex argument.
- Comments are ignored. Multi-line chains are joined.

## How matching works

1. **Tokenize.** Text is split into lowercase keywords: camelCase, kebab-case and URLs are split, stopwords (`the`, `a`, `to`, `and`, `is`, `should`, `user`, ...) are dropped, and a plural `s` is removed.
2. **Synonyms.** Verbs are mapped to one canonical verb: navigate/open/go to/visit → `goto`; click/press/tap → `click`; enter/type/input/fill → `fill`; check/tick → `check`; choose/select → `select` (but "select ... button/link" → `click`). "displayed/shown/appears" → `visible`, which matches `toBeVisible`.
3. **Pick a test.** For each manual case, the Playwright test with the highest Jaccard overlap (title + all tokens) is chosen. You can override it.
4. **Score each step.**
   - *Action match:* the share of the step's keywords (minus the verb) found in one Playwright action line. If the step has a canonical verb, the action must have the same verb.
   - *Expected match:* the share of the expected result's keywords found in one assertion line.
   - A match counts when its score is at least the threshold (default **0.34**).
5. **Status.**
   - COVERED: action matched, and there is no expected result or the expected result matched an assertion.
   - PARTIAL: action matched, but no assertion matched the expected result.
   - NOT COVERED: no matching action.
   - NEEDS HUMAN JUDGMENT: the step contains words like *looks, feels, visually, readable, aesthetic, color, layout, smooth, intuitive*. Listed separately and never counted as an automation gap.
6. **Coverage %** = COVERED steps / all steps.

## Optional AI helpers

The app works fully without AI. Two optional buttons add a second opinion:

- **AI check weak matches** (PARTIAL steps only): sends the step, its expected result, and the chosen test's assertions, and asks whether any assertion really verifies the expected result. The reply is `{ verdict: "verifies" | "weak" | "does_not_verify", reason }`, shown as a badge with the reason. Steps rated `weak` or `does_not_verify` stay in "Still needs manual testing". A step rated `verifies` leaves that list. The coverage % stays keyword-based.
- **AI draft code for gaps** (NOT COVERED steps only): asks for a short Playwright snippet, shown in a code box with a Copy button and the label "Draft. Review before using."

Details:

- At most 10 steps per click, sent as one request, to keep cost low. Click again for the next 10.
- No backend. You paste your own Anthropic API key into a password field. It is kept in React state only: never saved to localStorage and never logged. Reloading the page forgets it.
- The browser calls `POST https://api.anthropic.com/v1/messages` directly, with the headers `x-api-key`, `anthropic-version: 2026-10-21` and `anthropic-dangerous-direct-browser-access: true` (required for browser calls).
- The model name is an editable field (default `claude-opus-5-5`). For models that support it, the request turns on server-side refusal fallbacks (`fallbacks: "default"`).
- The model is asked for JSON only. The reply is parsed safely (plain JSON, JSON in a code fence, or the first JSON span in the text) and validated. Network errors, bad keys, rate limits and unreadable replies show a friendly message.
- **Use sample AI results:** when the sample data is loaded, this checkbox (on by default) shows pre-saved AI results, so the demo works without a key.

> AI is optional. Your pasted text is sent to the AI provider. Do not paste confidential data. AI output can be wrong, so please review it.

## Limits

- Keyword overlap is not understanding. Different words for the same thing ("redirected" vs a URL check with other words) can be missed, and shared words can create false matches. Use the "Matched by" column to check.
- Page objects, helper functions, loops and fixtures are not followed. Only code written inside the `test(...)` body is seen.
- `.not` assertions are treated like normal assertions.
- "Check that ..." is read as the `check` verb (a checkbox), so verification steps written that way may show NOT COVERED.
- A manual step without an action verb (for example "Verify the total") can only match an action, not an assertion, so it often shows NOT COVERED.
- AI verdicts and drafts can be wrong. They are suggestions only.

## Deploy

This is a static site. No server or environment variables are needed. `vite.config.ts` uses `base: './'`, so the same build works at a domain root or under a sub-path.

### GitHub Pages (used for the live demo)

`.github/workflows/deploy.yml` runs the tests, builds, and publishes `dist/` on every push to `main`. In the repo settings, Pages → Source must be **GitHub Actions**.

### Cloudflare Pages

**Option A: Git integration**

1. Push this repo to GitHub.
2. Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git → pick the repo.
3. Framework preset: **Vite** (or None). Build command: `npm run build`. Build output directory: `dist`.
4. Set the environment variable `NODE_VERSION` to `22` (or newer) if the default Node version is older.
5. Deploy. Every push to the main branch redeploys.

**Option B: Direct upload with Wrangler**

```bash
npm run build
npx wrangler pages deploy dist --project-name step-coverage
```

## Project layout

```text
src/
  lib/                 pure logic, unit-tested with Vitest
    tokenize.ts        tokens, stopwords, synonyms, step verb
    parseManual.ts     manual test case parser
    parsePlaywright.ts Playwright spec parser (regex + scanning)
    match.ts           test choice, step scoring, statuses, checklist
    ai.ts              optional AI calls and safe JSON parsing
    sample.ts          demo data and pre-saved AI results
  App.tsx              the page
  AiPanel.tsx          AI controls, verdict badge, draft code box
```
