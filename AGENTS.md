# AGENTS.md

Canonical project knowledge for KiraAP. Keep this file accurate and update it whenever you learn something durable (new convention, gotcha, command, architectural decision).

## Project purpose

**Kira Agent Platform (KiraAP)** — a self-hosted web app that wraps Google's Agent Platform / Vertex AI (Gemini + Veo) so an operator can offer AI chat, image generation, video generation, and TTS to end users under their own brand, with an admin panel for API key pooling/fallback, user management, and usage logging. UI text, validation messages, and docs are in Vietnamese — keep new user-facing strings in Vietnamese for consistency.

## Tech stack

- **Runtime**: Node.js v18+, Express 5
- **Database**: MongoDB via Mongoose (`^9.8.0` in package.json — note this is a newer major than the common v7/v8, don't assume v7/v8 API quirks apply)
- **Auth**: JWT (`jsonwebtoken`) + `bcryptjs` for password hashing; token read from `Authorization: Bearer`, cookie (`token`), in that order
- **Server-rendered views**: EJS + `express-ejs-layouts` (used for admin panel and for the SSR shell of user pages)
- **Frontend**: Vanilla JS (ES6+, no framework/bundler) in `public/js/`, plain CSS with custom properties in `public/css/`
- **Uploads**: `multer`, files land in `public/uploads/{images,videos,audios,temp}`
- **Hardening**: `helmet` (CSP disabled — see gotchas), `cors`, `express-rate-limit`
- **Logging**: `winston` (via `packages/logger/`) — structured app logger with console + daily-rotate JSON file transports; `morgan` is wrapped inside it for HTTP access logs rather than used standalone

## Directory layout

```
server/
├── app.js                 # Express bootstrap: middleware, route mounting, SSR page routes
├── seed.js                 # npm run seed — creates default admin user + AI model catalog
├── config/database.js      # Mongoose connect — thin wrapper around packages/mongo-connect-retry
├── middleware/
│   ├── auth.js              # JWT auth (header → cookie); redirects HTML admin requests, JSON elsewhere
│   ├── adminOnly.js          # role==='admin' gate, must run AFTER auth
│   ├── proxyAuth.js          # Authenticates the OpenAI-compatible proxy via UserApiKey (kira_sk_ prefix)
│   └── rateLimiter.js        # aiLimiter / authLimiter / apiLimiter (express-rate-limit)
├── models/                  # Mongoose schemas: User, ApiKey, UserApiKey, ModelConfig, Conversation, Message, Media, Voice, AILog (AIProvider/ProviderApiKey now live in packages/ai-providers/models/)
├── routes/
│   ├── auth.js               # /api/auth
│   ├── api/                  # JSON APIs: chat, image, video, tts, conversations, user, apiKeys, models, proxy
│   └── admin/                # EJS-rendered admin panel: dashboard, users, apiKeys, models, media, logs, userApiKeys (providers.js now lives in packages/ai-providers/routes/)
├── services/
│   ├── agentPlatform.js       # Unified wrapper — routes to Google Agent Platform / Vertex AI (default) OR delegates to packages/ai-providers/services/agentPlatformBridge.js (when ModelConfig.providerId is set)
│   ├── apiKeyManager.js       # Google ApiKey pool rotation + auto-fallback on quota/errors
│   └── tokenCounter.js        # Token usage accounting for AI logs (shared — called from both the Google path and packages/ai-providers/)
└── views/                   # EJS templates: layouts/{admin,user}, admin/*, auth/login, user/* (providers.ejs and 2 partials now live in packages/ai-providers/views/, loaded via app.js's `views` array + EJS include())

packages/                    # ALL custom/non-upstream code — see packages/README.md and the "packages/ isolation" convention below
├── mongo-connect-retry/     # connectWithRetry(mongoose, uri) — used by server/config/database.js
├── ai-providers/            # Custom AI Provider (OpenAI/Anthropic compatible) — models, services, routes, views, public, mirroring server/'s layout
└── logger/                  # winston instance (index.js) + morgan-backed HTTP middleware (httpLogger.js) — see plans/2026-08-05-app-logger-planning.md

public/
├── assets/                 # logo, icons, TTS voice sample audio
├── css/                    # variables.css + one file per concern (chat, admin, sidebar, docs, ...)
├── js/                     # one file per page/concern (app, auth, chat, imageGen, videoGen, ttsGen, ...)
└── uploads/                # generated media; gitignored except .gitkeep placeholders

.agents/
├── AGENTS.md                # standalone frontend rule (no native browser dialogs) — kept as its own file, do not edit or fold into this one
└── skills/agent-flatform-api/SKILL.md   # detailed Google Agent Platform integration reference (endpoints, payloads, Node/PHP/Python examples) — consult this before writing/modifying any AI-call code

docker/
└── docker-compose.yml        # app + mongo services; build context is the repo root (..), dockerfile: Dockerfile

.github/
├── actions/
│   ├── docker-build-push/    # composite action: buildx + GHCR login (push=true only) + set-version + docker/build-push-action
│   └── set-version/          # composite action: reads VERSION file (default "1.0") + github.run_number → env.VERSION
└── workflows/
    ├── kira-docker-publish.yml   # workflow_dispatch (tag-push trigger commented out) — builds & pushes to GHCR/Docker Hub, cache-type: registry
    ├── kira-docker-testing.yml   # workflow_dispatch — build-only (push: "false"), cache-type: gha
    └── changelog.yml             # on tag push `v*` or workflow_dispatch — writes .version.txt, runs auto-changelog → CHANGELOG-NQDEV.md, commits + pushes

docs/
└── BUSINESS-DOCUMENT.md      # business/domain documentation (Vietnamese)

plans/                       # execution plans written by the nqdev-write-plan skill (dated *.md files)

Dockerfile                  # multi-stage (deps → runtime), non-root, node:20.20.2-alpine, EXPOSE 3000, HEALTHCHECK against `/` — kept at repo root, not under docker/; COPYs server, public, AND packages (see gotcha below — packages was missing for a while)

logs/                        # winston file transports write here (gitignored) — combined-*.log + error-*.log, rotated daily, 7-day retention
```

## CI/CD

- Both Docker workflows (`kira-docker-publish.yml`, `kira-docker-testing.yml`) currently trigger only on `workflow_dispatch` — their `push: tags: v*` triggers are commented out, so tag pushes do **not** yet auto-build/publish images.
- Both delegate to the shared composite action `.github/actions/docker-build-push`, which itself calls `.github/actions/set-version` to compute `VERSION=<base>.<run_number>` (base comes from a repo-root `VERSION` file if present, else defaults to `1.0` — no `VERSION` file exists yet, so builds currently version as `1.0.<run_number>`).
- `changelog.yml` runs on `v*` tag pushes (or manually): sets `VERSION`, writes `.version.txt`, generates `CHANGELOG-NQDEV.md` via `auto-changelog`, and commits/pushes — distinct from the hand-maintained `CHANGELOG.md` at the repo root.

## Commands

- `npm install` — install dependencies
- `npm run dev` — start with nodemon (development)
- `npm start` — start with plain node (production)
- `npm run seed` — run `server/seed.js` to create the default admin user and seed the AI model catalog
- No test suite, linter, or formatter is configured in this repo (no `.eslintrc*`, `.prettierrc*`, or `test` script exist).
- `docker compose -f docker/docker-compose.yml up --build` — build and run the app + MongoDB in containers (requires `.env` at the repo root first, see below; builds from the root-level `Dockerfile`). Run `docker compose -f docker/docker-compose.yml exec app npm run seed` once, after the first startup, to create the admin account and model catalog inside the container's database.

## Environment configuration

Copy `.env.example` to `.env`. Required vars: `PORT`, `NODE_ENV`, `MONGODB_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_USERNAME`. Google Agent Platform API keys and project numbers are **not** env vars — they're managed at runtime through the admin panel (`/admin/api-keys`) and stored in the `ApiKey` collection for pooling/fallback.

## Conventions

- **No native browser dialogs** — see [`.agents/AGENTS.md`](.agents/AGENTS.md) for the rule (never `alert()`/`confirm()`/`prompt()`; use custom popups/modals instead). That file is the source of truth for this rule — don't edit it, and don't duplicate its content here.
- **Route split**: `server/routes/api/*` returns JSON; `server/routes/admin/*` renders EJS (`layouts/admin`); user-facing pages are rendered SSR from `app.js` directly with `layouts/user`. Keep new endpoints consistent with this split rather than mixing HTML and JSON in one route file.
- **Auth layering**: apply `auth` then `adminOnly` (in that order) for protected admin routes. The separate `proxyAuth` middleware (not `auth`) guards the OpenAI-compatible proxy under `/v1`, authenticating via `UserApiKey` documents (key format `kira_sk_...`), not JWTs.
- **Error responses**: JSON error shape is `{ success: false, message }` for internal APIs, but `{ error: { message, type, code } }` (OpenAI-style) for the `/v1` proxy routes — match whichever shape the surrounding route family already uses.
- **Mongoose validation messages** are user-facing Vietnamese strings defined inline in the schema (see `server/models/User.js`) — follow this pattern for new fields.
- **Application logging**: use `require('@packages/logger/index.js')` (`logger.error/warn/info/http/debug`) instead of `console.*` anywhere in `server/`/`packages/` — this is the app-level logger (console + rotating JSON files under `logs/`, 7-day retention, level via `LOG_LEVEL` env). Never log secrets (API keys, JWT, passwords, raw `Authorization` headers) — log specific fields, not whole `req.body`/`req.headers`. This is a separate concern from `AILog` (MongoDB business/usage log surfaced at `/admin/logs`) — don't conflate the two.
- **Design system**: coffee-brown + orange accent (`--accent:#E8740C`, `--brown:#4A2C2A`), Be Vietnam Pro font, defined as CSS custom properties in `public/css/variables.css`. User UI is light mode, admin UI is dark mode, both full-height (100vh) layouts — see `feature.md` for the original confirmed design decisions table.
- **`packages/` isolation (fork-tracking convention)**: this repo is a fork of an actively-developed upstream project (`origin/main-forked` mirrors it; periodically merged into `main`/working branches). Never add new business logic directly to a file that exists upstream — it becomes a merge-conflict magnet. Put new logic in `packages/<feature>/` (mirroring `server/`'s `models/services/routes/views/public` layout) and touch the upstream file only with a minimal hook point: one `require` + one delegated call/condition/`include()`. `server/` → `packages/` requires use the `@packages/*` alias, backed by the `module-alias` npm package (`_moduleAliases` field in root `package.json`; `require('module-alias/register')` is the very first line of the entrypoint `server/app.js` — it must stay first, or any `@packages/...` require executed before it throws `MODULE_NOT_FOUND`). `packages/` → `server/` requires (e.g. a package needing `server/middleware` or a shared model) go the other way, via Node's native subpath imports (`imports` field, `#server/*` → `./server/*`) — **must include the exact filename** (e.g. `require('#server/models/ModelConfig.js')`), unlike `@packages/*` this does not auto-resolve `index.js`. `jsconfig.json` additionally declares `@packages/*` under `paths` purely for VSCode IntelliSense (editor-only, has no effect on Node — `module-alias` is what actually makes it work at runtime). EJS `include()` can freely reach across from `server/views/` into `packages/*/views/` using a normal relative path (verified — resolves relative to the including file, not the configured `views` root). See `packages/README.md` and `plans/2026-08-03-packages-isolation-planning.md` for the full rationale and the file-by-file retrofit this was first applied to.

## Gotchas

- `helmet` is configured with `contentSecurityPolicy: false` and `crossOriginEmbedderPolicy: false` in `server/app.js` — CSP is intentionally off, don't assume it's protecting inline scripts/styles.
- Veo video generation is a Long-Running Operation (LRO): you must poll `fetchPredictOperation` after `predictLongRunning` — see `.agents/skills/agent-flatform-api/SKILL.md` for the exact endpoints and per-model `durationSeconds` constraints (`veo-3.1-lite`/`veo-3.0` support `[4,6,8]`s, `veo-2.0` supports `[5,6,7,8]`s).
- Gemini TTS returns **raw PCM audio** (24kHz, 16-bit, mono) — a 44-byte WAV header must be constructed manually before the audio is playable/downloadable (see `addWavHeader` example in the skill doc).
- Image generation requires `generationConfig.responseModalities: ['IMAGE', 'TEXT']` in the request payload — omitting it returns text instead of an image.
- `public/uploads/{images,videos,audios,temp}/*` is gitignored (only `.gitkeep` is tracked); media metadata lives in the `Media` model in MongoDB, not in git.
- Docker Hub login is commented out in `.github/actions/docker-build-push/action.yml` — `dockerhub-image` tags/metadata are computed but images are only ever actually pushed to GHCR, not Docker Hub, despite `DOCKERHUB_IMAGE` being defined in both workflow files.
- The Docker image workflows only run via manual `workflow_dispatch` right now (their tag-push triggers are commented out) — pushing a `v*` tag alone will run `changelog.yml` but will **not** build/publish a Docker image.
- **MongoDB is reached over VPN, not LAN** (self-hosted, single-node replica set) — the connection string needs `directConnection=true` (the server advertises an internal `hello.me` address unreachable from outside its LAN, causing "Server selection timed out" if omitted) and `server/config/database.js` delegates to `packages/mongo-connect-retry/index.js` (`connectWithRetry`), which retries the initial connection up to 5 times with increasing backoff (2/4/6/8s) before `process.exit(1)`, because a single transient VPN hiccup ("Socket 'connect' timed out") is common and usually resolves on the very next attempt — don't remove the retry loop assuming a bare `mongoose.connect()` is equivalent.
- **Custom AI Provider (OpenAI/Anthropic compatible)**: `ModelConfig.providerId` (default `null`) selects the backend. `null` = Google Agent Platform (original, untouched code path in `agentPlatform.js`). Set = `agentPlatform.js` delegates to `packages/ai-providers/services/agentPlatformBridge.js`, which resolves the `AIProvider` doc (managed at `/admin/providers`, sidebar group "NQDEV Platform", route/view/models all under `packages/ai-providers/`), rotates its `ProviderApiKey` pool via `packages/ai-providers/services/providerKeyManager.js` (mirrors `server/services/apiKeyManager.js` but keyed per-provider), and calls the matching adapter in `packages/ai-providers/services/providerAdapters/{openai,anthropic}.js`.
  - Key management (`ProviderApiKey` CRUD per provider) is a dedicated page at `GET /admin/providers/:id/keys` (`packages/ai-providers/routes/providers.js` + `packages/ai-providers/views/admin/provider-keys.ejs`), not a modal — the "Quản lý Key" icon in `providers.ejs` is a plain `<a href>` link. Any script on that page that calls `adminFetch`/`showToast`/etc. on load must wait for `DOMContentLoaded` (or be inside an event handler): those helpers are defined in the layout's own `<script>` block in `server/views/layouts/admin.ejs`, which renders **after** `<%- body %>` in the final HTML, so a page-level script that calls them synchronously at parse time throws `ReferenceError`.
  - Scope is intentionally `text` (chat) + `image` categories only — Anthropic has no image API, and `video`/`tts` remain Google-only (no vanilla OpenAI/Anthropic equivalent).
  - Streaming: adapters normalize the upstream SSE (OpenAI `delta.content` / Anthropic `content_block_delta`) into the exact Gemini JSON shape (`candidates[0].content.parts[0].text`) that `server/routes/api/chat.js` and `server/routes/api/proxy.js` already parse — so those two files needed **zero changes** to support custom providers. Any change to that Gemini-shape parsing in either file must stay compatible with `providerAdapters/sseHelper.js`.
  - **`sseHelper.js`'s `pull()` must not return without enqueueing at least 1 chunk (or closing the stream)** — discovered 2026-08-05 while testing a real custom provider (9router): the first upstream SSE event is very often a near-empty preamble (e.g. OpenAI-compatible `delta: {role:"assistant", content:""}`), and a `pull()` that reads upstream once, finds no text, and returns anyway causes the outer `ReadableStream` to silently stop calling `pull()` again — the whole chat request then hangs forever (no error, no timeout, `res` never ends) until something external (e.g. a dev-server restart) kills the connection. The fix wraps the per-pull upstream read in a loop that keeps calling `reader.read()` until it either enqueues real text or the upstream stream ends — don't "simplify" this back to a single read per `pull()` call.
  - **`sseHelper.js` also checks `parsed.error` and throws** — some OpenAI-compatible backends (9router observed this under load: `{"error":{"type":"server_error","message":"...The request queue is full."}}`) report failures as a normal `data:` SSE event with HTTP 200, not as an HTTP error status. Before this check existed, `extractText()` just returned `''` for such an event (no `choices[].delta.content` to match), so the stream closed with zero output and **no error surfaced anywhere** — the user just saw an infinite "Đang suy nghĩ..." with nothing after. If a provider's error shape doesn't use `{error:{message}}`, add a similar guard in that provider's `extractText` callback instead of assuming this one check covers every provider.
  - **Token tracking for streamed custom-provider chat is real, not hardcoded `0`** (fixed 2026-08-05 — see `plans/2026-08-05-custom-provider-token-tracking-planning.md`): `createGeminiSSEStream(upstreamBody, extractText, extractUsage)` takes an optional 3rd callback that pulls `{tokenInput, tokenOutput}` out of a provider event; it merges partial results across events (shallow merge, only overwrites a field the callback actually returned — needed because Anthropic reports `tokenInput` at `message_start` and `tokenOutput` at `message_delta`, two separate events) and emits one final Gemini-shape chunk carrying `usageMetadata` right before closing the stream, which `chat.js`/`proxy.js` already read via their existing `if (chunk.usageMetadata)` check — neither file needed changes. `openai.js` sends `stream_options: { include_usage: true }` (verified against 9router: usage arrives on the same chunk as `finish_reason:"stop"`, not a separate trailing chunk as OpenAI's own docs describe — don't assume a fixed chunk position, always check top-level `usage` on every chunk). If a provider doesn't support usage-in-stream, `extractUsage` simply returns `null` every time and behavior is identical to before (still logs `0`) — this is an intentional, confirmed-with-user design choice: **no character-count heuristic estimate is used as a fallback**, to keep `/admin/logs` numbers trustworthy (either real or honestly `0`, never a guess).
  - `server/routes/api/proxy.js`'s streaming branch (`POST /v1/chat/completions` with `stream:true`) now also calls `tokenCounter.logUsage` after the stream ends, for **both** Google and custom-provider models — before this fix it silently logged nothing at all for any streamed request through this OpenAI-compatible endpoint (`chat.js`, the SSR web UI's own chat route, already did this correctly; `proxy.js` was the gap).
  - UI additions in `server/views/layouts/admin.ejs` (nav group) and `server/views/admin/models.ejs` (provider `<select>`) are only partially extracted: the nav-group block and the self-contained `MODEL_PROVIDERS`/`providerSelectOptions()`/`toggleProviderGroup()` script moved to `packages/ai-providers/views/` partials via `include()`, but the `providerSelectOptions(...)` call sites and `providerId` field reads inside `models.ejs`'s shared `openAddModelModal`/`editModel`/`saveModel`/`updateModel` functions were left in place — they're single-line touches inside functions that also handle every other model field, and fully extracting them would require restructuring those shared functions themselves (judged not worth the added indirection; see Risk 3 in `plans/2026-08-03-packages-isolation-planning.md`).
