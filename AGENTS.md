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
- **Hardening**: `helmet` (CSP disabled — see gotchas), `cors`, `express-rate-limit`, `morgan` logging

## Directory layout

```
server/
├── app.js                 # Express bootstrap: middleware, route mounting, SSR page routes
├── seed.js                 # npm run seed — creates default admin user + AI model catalog
├── config/database.js      # Mongoose connect
├── middleware/
│   ├── auth.js              # JWT auth (header → cookie); redirects HTML admin requests, JSON elsewhere
│   ├── adminOnly.js          # role==='admin' gate, must run AFTER auth
│   ├── proxyAuth.js          # Authenticates the OpenAI-compatible proxy via UserApiKey (kira_sk_ prefix)
│   └── rateLimiter.js        # aiLimiter / authLimiter / apiLimiter (express-rate-limit)
├── models/                  # Mongoose schemas: User, ApiKey, UserApiKey, ModelConfig, Conversation, Message, Media, Voice, AILog
├── routes/
│   ├── auth.js               # /api/auth
│   ├── api/                  # JSON APIs: chat, image, video, tts, conversations, user, apiKeys, models, proxy
│   └── admin/                # EJS-rendered admin panel: dashboard, users, apiKeys, models, media, logs, userApiKeys
├── services/
│   ├── agentPlatform.js       # Calls into Google Agent Platform / Vertex AI (Gemini, Veo, TTS)
│   ├── apiKeyManager.js       # API key pool rotation + auto-fallback on quota/errors
│   └── tokenCounter.js        # Token usage accounting for AI logs
└── views/                   # EJS templates: layouts/{admin,user}, admin/*, auth/login, user/*

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

Dockerfile                  # multi-stage (deps → runtime), non-root, node:18-alpine, EXPOSE 3000 — kept at repo root, not under docker/
```

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

## Gotchas

- `helmet` is configured with `contentSecurityPolicy: false` and `crossOriginEmbedderPolicy: false` in `server/app.js` — CSP is intentionally off, don't assume it's protecting inline scripts/styles.
- Veo video generation is a Long-Running Operation (LRO): you must poll `fetchPredictOperation` after `predictLongRunning` — see `.agents/skills/agent-flatform-api/SKILL.md` for the exact endpoints and per-model `durationSeconds` constraints (`veo-3.1-lite`/`veo-3.0` support `[4,6,8]`s, `veo-2.0` supports `[5,6,7,8]`s).
- Gemini TTS returns **raw PCM audio** (24kHz, 16-bit, mono) — a 44-byte WAV header must be constructed manually before the audio is playable/downloadable (see `addWavHeader` example in the skill doc).
- Image generation requires `generationConfig.responseModalities: ['IMAGE', 'TEXT']` in the request payload — omitting it returns text instead of an image.
- `public/uploads/{images,videos,audios,temp}/*` is gitignored (only `.gitkeep` is tracked); media metadata lives in the `Media` model in MongoDB, not in git.
