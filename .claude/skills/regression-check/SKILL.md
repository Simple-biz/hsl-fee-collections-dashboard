---
name: regression-check
description: >-
  Regression / correctness review of pending changes in the HSL Fee Collection
  dashboard before committing or opening a PR. Use when the user asks to "check
  for regressions", "did anything break", "review my changes", or before
  finalizing a branch. Audits for behavior breakage (schema/migration drift,
  API-contract changes, server-vs-client fetch boundaries, import-mapper tests)
  and runs the lint/test/build gates. For auth/access/PII/secrets risks, use the
  security-check skill instead.
---

# Regression Check

Audit the **pending diff** (not the whole repo) for regressions — things that
worked before and might not now — then run the automated gates. Report findings
grouped by severity; do not fix unless asked.

## 1. Scope the diff

```bash
git status
git diff --stat
git diff            # working tree
git diff --cached   # staged
```

Review only changed files plus anything they import or that imports them. If the
diff is large, summarize the affected surface first, then trace callers.

## 2. Regression checks (read CLAUDE.md first)

- **Schema/migration drift.** If `src/lib/db/schema.ts` changed, a matching
  migration must exist under `drizzle/` (run `npm run db:generate` if not). New
  columns referenced by inserts/selects must actually exist in a migration.
  Never hand-edit generated SQL except the documented reconcile scripts.
- **Breaking API contract.** If an `/api` route's request/response shape changed
  (fields added/removed/renamed, new required input, new status codes), confirm
  `src/services/api.ts` and every caller were updated and still handle `!res.ok`.
  New 401/403 guards are a contract change — verify callers surface or tolerate them.
- **Server vs client fetch boundary.** Server components fetch directly from the
  DB/server helpers; client components go through `src/services/api.ts`. Flag any
  client component (`"use client"`) importing the DB client or `server-only` code,
  and any session/theme-dependent conditional render that could differ between
  server and client (hydration mismatch).
- **Import mappers.** Changes under `src/lib/import/` must keep the `__tests__/`
  mappers green (external row → DB shape). If parsing/mapping logic was edited,
  confirm the corresponding test covers the new behavior.
- **Shared helpers / props.** If a shared util, hook, or component prop signature
  changed, check every consumer. Renamed/removed exports are a common breakage.
- **Behavior parity.** For refactors, confirm the new code path produces the same
  result as the old for existing inputs (e.g. duplicated logic that could drift).

## 3. Automated gates

Run and report results verbatim. Don't claim "passing" without running them.

```bash
npm run lint
npm test
npm run build      # also catches type errors
```

Distinguish pre-existing warnings (e.g. the known `combobox.tsx` warning) from
ones this diff introduced.

## 4. Report

- **Blockers** — regressions that must be fixed before commit (broken contract,
  missing migration, failing gate).
- **Warnings** — likely issues or missing test/migration coverage.
- **Nits** — style/consistency, optional.
- **Gate results** — lint / test / build pass-fail with relevant output.

End with a one-line verdict: safe to commit, or what must change first. Offer to
fix the blockers if the user wants.
