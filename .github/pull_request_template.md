# Pull Request

## Related Jira / Issue

Link the Jira ticket (e.g. `QUYIT-123`) or GitHub issue this PR addresses, if any.

## Summary

Describe the change, the problem it solves, and the impact on users.

## Changes

- Bullet list of what changed (modules/files touched, notable design decisions)

## Checklist

- [ ] Target branch is correct — `develop`/`opcode/*` for in-progress work, `master`/`master-forked` for release-ready code (see [`AGENTS.md`](../AGENTS.md#fork--upstream-sync) "Fork & upstream sync").
- [ ] New feature/business logic lives in `packages/*` and is only *imported* into `src/`/`open-sse/` via `@9router/*` — never written directly in those trees (hard rule, see [`AGENTS.md`](../AGENTS.md#new-features-always-in-packages-hard-rule)).
- [ ] Ran the test suite (`cd tests && npx vitest run --reporter=verbose --config ./vitest.config.js`, or a targeted subset) and checked for new regressions rather than assuming a clean run — the suite is **not** all-green on a plain checkout (see `tests/__baseline__/known-fails.txt`).
- [ ] No secrets, API keys, or tokens committed.
- [ ] Updated `AGENTS.md` (root or the nearest nested one) if this changes architecture, conventions, or a gotcha future work should know about.
- [ ] For UI changes: manually exercised the feature in the dashboard (golden path + edge cases), screenshots attached below if relevant.

## Verification

Describe how you tested this — steps taken, commands run, and results (including anything you could not verify, e.g. no access to a given provider's live API).

## Changelog Entry

CHANGELOG.md is auto-generated from commit messages on release (see `.github/workflows/changelog.yml`), but summarize here for reviewers if user-facing:

### Features

-

### Fixes

-

## Title Prefix

Commit/PR titles in this repo follow Conventional Commits, optionally scoped to the module touched (e.g. `feat(comboAutoReorder): ...`, `fix(chatCore): ...`):

- **feat**: New features or enhancements
- **fix**: Bug fixes or corrections
- **refactor**: Code restructuring without behavior change
- **perf**: Performance improvements
- **chore**: Tooling, deps, or non-functional changes
- **docs**: Documentation only
- **ci**: CI/CD workflow changes
- **build**: Build system or dependency changes

## Additional Context

Add anything reviewers should know before review.
