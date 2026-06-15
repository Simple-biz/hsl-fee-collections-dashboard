# CLAUDE.md

Guidance for working in the HSL Fee Collection dashboard.

## What this is

A Next.js (App Router) internal dashboard for Hogan Smith Law's fee collections
team. It tracks Social Security disability fee cases, syncs data from external
systems (Google Sheets, MyCase, Chronicle), and exposes role-gated pages for
collections, reporting, and admin.

## Tech stack

- **Next.js 16** (App Router) + **React 19**, TypeScript (strict)
- **Tailwind CSS v4** + shadcn/ui components (Radix + Base UI under the hood)
- **Drizzle ORM** over **PostgreSQL** (Neon). Two databases: the app DB
  (`DATABASE_URL`) and a read-only MyCase mirror (`MYCASE_DB_URL`).
- **NextAuth v5** (Credentials provider, JWT sessions)
- React Hook Form + Zod, Recharts, Sonner (toasts), Vitest (tests)
- **n8n** webhooks for external integrations (Sheets sync/push, MyCase docs,
  welcome emails)

## Commands

```bash
npm run dev            # dev server (http://localhost:3000)
npm run build          # production build
npm run lint           # eslint
npm test               # vitest run
npm run test:watch     # vitest watch

npm run db:generate    # generate a migration from schema.ts changes
npm run db:migrate     # apply pending migrations
npm run db:studio      # Drizzle Studio
npm run user:create    # create a user via CLI (scripts/create-user.ts)
npm run seed:test-users# seed the test accounts
```

DB scripts load `.env.local` via `dotenv -e .env.local`. Copy `.env.example`
to `.env.local` first (see that file for the full annotated var list).

## Project layout

- `src/app/` — routes, pages, server actions, and API route handlers
  - `src/app/(dashboard)/` — authenticated pages (route group, shared layout)
  - `src/app/api/` — REST handlers grouped by resource
  - `src/app/login/`, `change-password/` — unauthenticated/auth flows
- `src/components/` — feature components by domain (`cases/`, `admin/`,
  `settings/`, etc.) plus `ui/` (shadcn primitives — generally don't hand-edit)
- `src/lib/` — non-UI logic
  - `db/` — Drizzle client (`index.ts`) + schema (`schema.ts`), MyCase mirror (`mycase.ts`)
  - `access/` — page-level access control (see below)
  - `import/` — mappers that normalize external rows (Sheets/MyCase/xlsx) into DB shape
  - `chronicle-client.ts`, `mycase-proxy.ts` — external API clients
- `src/services/api.ts` — typed client-side `fetch` wrapper for the app's own `/api`
- `src/auth.ts`, `src/auth.config.ts`, `src/proxy.ts` — auth (details below)
- `drizzle/` — generated SQL migrations (sequentially numbered)
- `scripts/` — one-off CLI/maintenance scripts
- `n8n/` — exported n8n workflow JSON (source of truth for the webhooks)

Path alias: `@/*` → `src/*`.

## Auth & access control (read before touching auth)

Auth is split across two files to keep the **edge bundle Node-free**:

- `src/auth.config.ts` — **edge-safe** config imported by `proxy.ts` (middleware).
  Holds the `authorized` route gate and `jwt`/`session` callbacks. MUST NOT
  import the DB client, bcrypt, or any Node-only module.
- `src/auth.ts` — full config with the Credentials provider (bcrypt + DB lookup).

Page access is **role default ⊕ per-user overrides**, computed once at sign-in
and baked into the JWT as `user.pages`, so the edge gate needs no DB read:

- `src/lib/access/pages.ts` — the page registry (`PAGES`, `pageKeyForPath`)
- `src/lib/access/role-defaults.ts` — default page set per role
- `src/lib/access/resolve.ts` — pure `effectivePages` / `hasPageAccess` (edge-safe)
- `src/lib/access/server.ts` — the DB read that loads a user's overrides
- Roles: `member`, `lead`, `admin`, `system_admin`. Use `requireAdmin()` /
  `isAdminRole()` from `src/lib/auth-helpers.ts` to guard server actions & routes.

When adding a new page: register it in `PAGES`, add it to role defaults, and the
sidebar/gate pick it up automatically.

## Database conventions

- Single schema file: `src/lib/db/schema.ts` (enums, tables, relations).
- Change the schema there, then `npm run db:generate` + `npm run db:migrate` —
  never hand-write migration SQL except for the documented reconcile scripts.
- The Drizzle client is cached on `globalThis` (`src/lib/db/index.ts`) to survive
  HMR; `prepare: false` because Neon's pooler doesn't support prepared statements.
- The MyCase DB is a **read-only mirror** — query it, never write to it.

## Patterns to follow

- **TypeScript strict mode is on** (`tsconfig.json` → `"strict": true`). Keep it
  that way — don't relax compiler flags to make code pass.
- **Never use `any`.** Prefer precise types; reach for `unknown` + narrowing,
  generics, or a Zod-inferred type at boundaries. If a third-party type is
  missing, type the shape you actually use rather than widening to `any`.
- **Follow the existing folder structure** (see Project layout above). Put new
  code where its siblings live — routes under `src/app/`, feature components by
  domain in `src/components/<domain>/`, non-UI logic in `src/lib/`, shared types
  in `src/types/`. Reuse a shared helper (e.g. extract to `src/lib/`) instead of
  duplicating logic across files.
- **Server components fetch directly** from the DB/server helpers; **client
  components** call `/api` via `src/services/api.ts`.
- Validate inputs with **Zod** at boundaries (server actions, route handlers,
  auth).
- Don't leak account existence in auth errors — mirror the existing "same null
  response" pattern in `src/auth.ts`.
- External integrations go through n8n webhooks (URLs in env), not direct calls,
  unless an existing client in `src/lib/` already wraps the API.
- Match the surrounding component style; reuse `src/components/ui/` primitives
  rather than introducing new UI libraries.

## Testing

Vitest with `vite-tsconfig-paths` (so `@/` works in tests). Tests live next to
the code in `__tests__/` (e.g. `src/lib/import/__tests__/`). Run `npm test`
before considering import/mapper changes done.

## Notes

- `NEXT_PUBLIC_SHOW_TEST_LOGINS=true` reveals seeded test credentials on the
  login page (`src/app/login/test-accounts-hint.tsx`). Test-only — leave unset
  in production.
- This is a Windows dev environment; the Bash tool runs Git Bash (POSIX), and
  PowerShell is also available.
