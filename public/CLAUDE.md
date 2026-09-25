# CLAUDE.md — public/

Scope: frontend assets (`public/js/`, `public/css/`, `public/assets/`). Vanilla JS (ES6+), no framework, no bundler — don't introduce one for a single feature; match the existing one-file-per-page/concern layout in `public/js/`.

## Mandatory rule — do not skip

**No native browser dialogs.** Never use `alert()`, `confirm()`, or `prompt()` — use custom popups/modals instead. This rule is defined in [`.agents/AGENTS.md`](../.agents/AGENTS.md), which must be kept as-is; do not edit that file or duplicate its content here, only follow it.

## Design system

Coffee-brown + orange accent (`--accent:#E8740C`, `--brown:#4A2C2A`), Be Vietnam Pro font, defined as CSS custom properties in `public/css/variables.css`. User-facing UI is light mode, admin UI is dark mode, both full-height (`100vh`) layouts. See `feature.md` at the repo root for the original confirmed design-decision table before changing these tokens.

## Uploads

`public/uploads/{images,videos,audios,temp}/*` is gitignored (only `.gitkeep` is tracked) — generated media metadata lives in the `Media` MongoDB model, not in git. Don't add upload output paths to version control.
