# CLAUDE.md — packages/ai-providers/

Scope: Custom AI Provider (OpenAI/Anthropic-compatible) subsystem. Read [`packages/CLAUDE.md`](../CLAUDE.md) and root `AGENTS.md`'s "Custom AI Provider" gotcha block first — this file is a pointer, not a replacement.

`ModelConfig.providerId` (default `null`) is the routing switch: `null` stays on the original Google Agent Platform path in `server/services/agentPlatform.js`; set → delegates to `services/agentPlatformBridge.js` here.

## High-risk spots — read the full `AGENTS.md` entry before touching these

- **`services/providerAdapters/sseHelper.js`'s `pull()`** — must never return without enqueueing at least one chunk or closing the stream. A `pull()` that reads once, finds no text, and returns causes the outer `ReadableStream` to silently stop calling `pull()` again — the request hangs forever with no error. Loop the upstream read inside `pull()`, don't simplify it back to a single read.
- **`sseHelper.js` error detection** — some OpenAI-compatible backends report failures as a normal `data:` SSE event with HTTP 200 (`{"error":{...}}`), not an HTTP error status. If a provider uses a different error shape, add a matching guard in that provider's `extractText` callback rather than assuming the existing check covers it.
- **Token usage merging** (`createGeminiSSEStream`'s optional 3rd callback) does a shallow merge across streamed events on purpose — Anthropic reports `tokenInput` at `message_start` and `tokenOutput` at a separate `message_delta` event. If a provider doesn't support usage-in-stream, `extractUsage` returns `null` and usage logs `0` — **no character-count heuristic fallback is used**, by deliberate design (keeps `/admin/logs` numbers honest).
- Anthropic's adapter only implements `generateText(Stream)` — no image/tts/video API exists to call. Don't assume feature parity with the OpenAI-shaped adapter without checking `providerAdapters/anthropic.js` first.
- Kira's `generateTTS`/`generateVideo`/`pollVideoOperation` (in `providerAdapters/openai.js`) are implemented against the documented contract but were **not yet verified against a real `KIRA_API_KEY`** as of the last `AGENTS.md` update — treat response-shape assumptions there as unverified until tested live, and re-check `AGENTS.md` for a newer status before trusting this note.

## Admin UI note

The "Quản lý Key" page (`GET /admin/providers/:id/keys`) is a separate page, not a modal. Any script there that calls layout-provided helpers (`adminFetch`, `showToast`, etc.) on load must wait for `DOMContentLoaded` — those helpers are defined in `server/views/layouts/admin.ejs`, which renders *after* `<%- body %>`.
