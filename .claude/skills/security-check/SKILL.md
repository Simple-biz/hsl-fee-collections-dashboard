---
name: security-check
description: >-
  Security audit of pending changes in the HSL Fee Collection dashboard before
  committing or opening a PR. Use when the user asks for a "security check/review",
  "is this safe to commit/push", or to check auth/access/PII/secrets. Audits the
  codebase-specific security invariants (edge-safe auth, access gates, account
  enumeration, PII/SSN handling, read-only MyCase mirror, secrets, Zod boundaries,
  SQL safety, authz on mutations) and runs the build (the edge-bundle gate).
  For correctness/regression review, use the regression-check skill instead.
---

# Security Check

Audit the **pending diff** (not the whole repo) for security risks specific to
this codebase, then confirm the edge bundle still builds. Report findings grouped
by severity; do not fix unless asked.

## 1. Scope the diff

```bash
git status
git diff --stat
git diff            # working tree
git diff --cached   # staged
```

Review only changed files plus anything they import/affect. If the diff is large,
summarize the security-relevant surface first (auth, API routes, server actions,
DB queries, env).

## 2. Security invariants (read CLAUDE.md first, then verify each the diff touches)

- **Edge-safe auth.** `src/auth.config.ts` and anything it imports
  (`src/lib/access/pages.ts`, `resolve.ts`, `role-defaults.ts`, `capabilities.ts`,
  `src/proxy.ts`) MUST NOT import the DB client, `bcryptjs`, `server-only`, or any
  Node-only module. A Node import here breaks the edge middleware bundle. The full
  config with the Credentials provider belongs in `src/auth.ts`.
- **Access gates.** New pages must be registered in `PAGES`
  (`src/lib/access/pages.ts`) AND added to `role-defaults.ts`, or they are silently
  ungated/inaccessible. New capabilities go in `capabilities.ts` + its role
  defaults. New API routes and server actions that mutate must guard with
  `requireAdmin()` / `requireCapability()` / `isAdminRole()`
  (`src/lib/auth-helpers.ts`). Check `effectivePages`/`effectiveCapabilities`
  logic isn't bypassed.
- **No account enumeration.** Auth/login/change-password flows must keep the
  "same null response" pattern — never reveal whether an account exists, is
  disabled, or the password was wrong (`src/auth.ts`).
- **PII / SSN.** Fields like `ssn_last4`, full SSNs, passwords, and password
  hashes must never be logged, returned in API responses to non-privileged roles,
  pushed to Sheets, or sent through n8n webhooks unintentionally. Verify `select`
  lists don't widen to include `passwordHash`.
- **Read-only MyCase mirror.** Code touching `src/lib/db/mycase.ts` /
  `MYCASE_DB_URL` must only read — no insert/update/delete.
- **Secrets & env.** No hardcoded keys, tokens, or connection strings. New env
  vars must be added to `.env.example` (annotated, placeholder value — never a
  real secret). Webhook token headers (e.g. `N8N_MYCASE_DOCS_WEBHOOK_TOKEN`) must
  still be sent/validated. Confirm `.env.local` is not staged.
- **Zod at boundaries.** Server actions, route handlers, and auth must validate
  inputs with Zod before use. Flag any route reading `req.json()` / query params
  straight into a DB call.
- **SQL safety.** Prefer the Drizzle query builder. Any raw SQL must be
  parameterized — no string-interpolated user input. Column allowlists mitigate
  but don't excuse interpolation.
- **Test-only flags.** `NEXT_PUBLIC_SHOW_TEST_LOGINS` and seeded test accounts
  must stay gated behind the env flag and out of production paths.
- **Authz on mutations.** Every API route that writes must confirm the session
  and capability/role before mutating; client-side gating is not sufficient (it's
  UX only — the route is the authority).

## 3. Gate

```bash
npm run build      # strongest signal for the edge-safe-auth invariant
```

A Node import leaking into the edge bundle fails the build. Report the result
verbatim (compiled / Proxy-middleware compiled / errors). Don't claim it passes
without running it.

## 4. Report

- **Blockers** — security risks that must be fixed before commit.
- **Warnings** — likely issues or weak spots (e.g. unparameterized SQL, missing
  guard on a mutating route).
- **Nits** — defense-in-depth suggestions, optional.
- **Gate result** — build pass/fail with relevant output.
- **Pre-existing vs introduced** — clearly separate risks this diff introduced
  from ones it merely touched.

End with a one-line verdict: safe to commit, or what must change first. Offer to
fix the blockers if the user wants.
