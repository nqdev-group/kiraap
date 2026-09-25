# CLAUDE.md — server/

Scope: Express backend (`server/`). Read the root [`CLAUDE.md`](../CLAUDE.md) first, then [`AGENTS.md`](../AGENTS.md) in full — this file only adds server-specific emphasis, it does not replace either.

Relevant `AGENTS.md` sections for this directory: "Directory layout" (`server/` tree), "Conventions" (route split, auth layering, error response shapes, Mongoose validation messages, application logging), and "Gotchas" (VPN/MongoDB connection, CSP disabled, LRO video polling, Gemini TTS raw PCM).

## Server-specific reminders

- **Never add new business logic directly to a file under `server/` that also exists upstream** (this repo tracks an upstream fork via `origin/main-forked`). New logic belongs in `packages/<feature>/`, mirroring `server/`'s `models/services/routes/views/public` layout — touch `server/` only for a minimal hook point (`require` + one call/condition/`include()`). See [`packages/README.md`](../packages/README.md) and the "packages/ isolation" convention in `AGENTS.md`.
- Route split is enforced by convention, not tooling: `routes/api/*` → JSON only, `routes/admin/*` → EJS-rendered, user-facing pages → SSR directly from `app.js`. Don't mix HTML and JSON in one route file.
- Protected admin routes apply `auth` then `adminOnly`, in that order. The `/v1` proxy uses `proxyAuth` (UserApiKey, not JWT) — don't substitute `auth` there.
- Use `require('@packages/logger/index.js')` instead of `console.*` anywhere in this tree; never log secrets or whole `req.body`/`req.headers`.
