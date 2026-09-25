# CLAUDE.md — packages/

Scope: all custom/non-upstream code. The canonical rules for this directory already live in [`packages/README.md`](README.md) (Vietnamese, comprehensive) — read that first. `AGENTS.md`'s "packages/ isolation (fork-tracking convention)" bullet in "Conventions" is the English summary.

## Why this directory exists

This repo is a fork of an actively-developed upstream project (`origin/main-forked` mirrors it, periodically merged into `main`/working branches). Any file that exists only under `packages/` cannot conflict on merge, because upstream doesn't know the directory exists. Files touched in `server/`/`public/` should be reduced to a single stable hook point.

## Rules that apply to every subpackage

- Mirror `server/`'s layout inside each package: `models/ services/ routes/ views/ public/`.
- `server/` → `packages/` requires use the `@packages/*` alias (`module-alias`, registered first-line in `server/app.js` — never require `@packages/...` before that line runs, e.g. in a standalone `node -e` script).
- `packages/` → `server/` requires use Node's native subpath imports (`#server/*`) and **must** include the exact filename — unlike `@packages/*`, this does not auto-resolve `index.js`.
- Before adding a new subpackage, check the "Danh sách package hiện có" table in `packages/README.md` for existing ones (`mongo-connect-retry/`, `ai-providers/`, `logger/`) to avoid duplicating an existing bridge/utility.

See [`packages/ai-providers/CLAUDE.md`](ai-providers/CLAUDE.md) for the largest and most actively-changing subpackage.
