## HSL Fee Collection Dashboard

This is a [Next.js](https://nextjs.org) dashboard for HSL Fee Collection, using TypeScript, Tailwind CSS, Drizzle ORM, and PostgreSQL.

---

## Runtime

**Node.js 22 LTS** is the required runtime. Pin it locally with [nvm](https://github.com/nvm-sh/nvm):

```bash
nvm use   # reads .nvmrc → 22
```

---

## 🚀 Getting Started

1. **Clone the repository & install dependencies:**

   ```bash
   npm ci
   ```

2. **Configure environment variables:**

   Copy `.env.example` to `.env.local` and fill in the values:

   ```bash
   cp .env.example .env.local
   ```

   Required vars: `DATABASE_URL`, `MYCASE_DB_URL`, `AUTH_SECRET`, `CHRONICLE_API_URL`, `CHRONICLE_API_KEY`, and the n8n webhook URLs. See `.env.example` for the full list with descriptions.

   Optional (used by the settings/connections page): `CHRONICLE_BASE_URL`, `MYCASE_API_URL`, `MYCASE_API_KEY`, `CALLTOOLS_API_KEY`.

   _Do not commit `.env.local`._

3. **Run the development server:**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🗄️ Database & Migrations

- Uses [Drizzle ORM](https://orm.drizzle.team/) for database access.
- Configure your database connection in `.env.local` (`DATABASE_URL`).
- Migration config: `src/drizzle.config.ts` (schema in `src/lib/db/schema.ts`).

```bash
npm run db:generate   # generate a new migration from schema changes
npm run db:migrate    # apply pending migrations
npm run db:studio     # open Drizzle Studio
```

---

## 🛠️ Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server |
| `npm run build` | Build for production |
| `npm start` | Start production server |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript type-check (no emit) |
| `npm test` | Run unit/integration tests (Vitest) |
| `npm run test:watch` | Vitest watch mode |
| `npm run test:e2e` | Playwright smoke tests (requires running server) |
| `npm run db:generate` | Generate migration from schema diff |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:studio` | Open Drizzle Studio |
| `npm run user:create` | Create a new user via CLI script |
| `npm run seed:test-users` | Seed the seeded test accounts |

### Quality gate (run before opening a PR)

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

### Playwright smoke tests

Smoke tests are read-only. The two unauthenticated tests need no credentials.
Authenticated tests require env vars pointing at a **non-production** environment
(e.g. the Neon test branch with seeded accounts):

```bash
export E2E_BASE_URL=http://localhost:3000
export E2E_MEMBER_EMAIL=member@hogansmith.com
export E2E_MEMBER_PASSWORD=member123
export E2E_ADMIN_EMAIL=admin@hogansmith.com
export E2E_ADMIN_PASSWORD=admin123
```

Run locally against a running dev server:

```bash
# terminal 1
npm run dev

# terminal 2
npm run test:e2e
```

Without the credential env vars the authenticated tests are skipped automatically.
`E2E_BASE_URL` (or `PLAYWRIGHT_BASE_URL`) overrides the default `http://localhost:3000`:

```bash
E2E_BASE_URL=https://staging.example.com npm run test:e2e
```

### Missing integration config

If any required env var is absent, the app will error on startup. Check `.env.example` for the full annotated list. External integrations (Chronicle, MyCase, n8n webhooks) can be left blank in development — pages that call those services will show an error state rather than crash.

### Dev server and the database

`npm run dev` connects directly to the database specified in `DATABASE_URL`. There is no separate local/dev database by default. Use the Neon test branch (`.env.neon-branch`) when you need a safe sandbox for migration testing.

---

## 📦 Main Tech Stack

- Next.js (App Router, TypeScript)
- Tailwind CSS
- Drizzle ORM (PostgreSQL / Neon)
- NextAuth v5
- Base UI (`@base-ui/react`), React Hook Form, Zod, Recharts

---

## 📝 Project Structure

- `src/app/` — App routes, pages, and server actions
- `src/components/` — UI and dashboard components
- `src/lib/` — Utilities, context, API clients, and DB schema
- `src/services/api.ts` — API request helpers
- `src/drizzle.config.ts` — Drizzle Kit config
- `drizzle/` — SQL migration files
- `scripts/` — CLI utility scripts

---

## 🧑‍💻 Notes

- For custom theming, see `src/components/theme-provider.tsx` and `src/lib/theme-classes.ts`.
- API endpoints and data fetching are handled in `src/services/api.ts`.
- Make sure your database is running and accessible.

---

## 📚 Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Drizzle ORM Docs](https://orm.drizzle.team/docs)
- [Tailwind CSS Docs](https://tailwindcss.com/docs)

---

## ⚡ Deploy

Deployments are manual via the Vercel CLI. Merging to `main` does **not** auto-deploy.

```bash
vercel --prod --scope simpleandhsl
```

Branches: `develop` = staging, `main` = production.
