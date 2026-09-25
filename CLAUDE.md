# CLAUDE.md

Before doing any significant work in this repository, read `AGENTS.md`.

- `AGENTS.md` is the canonical source of project knowledge (architecture, conventions, commands, gotchas).
- Do not duplicate project knowledge here — this file is only a pointer.
- Whenever you learn something durable about this project, update `AGENTS.md` accordingly.

Also read [`.agents/AGENTS.md`](.agents/AGENTS.md) — it holds the frontend rule against native browser dialogs (`alert()`/`confirm()`/`prompt()`; use custom popups/modals instead). That file must be kept as-is — do not edit it.

## Scope-specific guidance

These directories have their own `CLAUDE.md` with scope-specific reminders (still pointers into `AGENTS.md`, not duplicates) — Claude should prefer the nearest one when working inside that directory:

- [`server/CLAUDE.md`](server/CLAUDE.md) — Express backend
- [`packages/CLAUDE.md`](packages/CLAUDE.md) — packages isolation convention
- [`packages/ai-providers/CLAUDE.md`](packages/ai-providers/CLAUDE.md) — Custom AI Provider subsystem
- [`public/CLAUDE.md`](public/CLAUDE.md) — frontend assets
- [`docs/CLAUDE.md`](docs/CLAUDE.md) — documentation
