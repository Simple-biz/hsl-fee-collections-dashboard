## HSL Fee Collection Dashboard

This is a [Next.js](https://nextjs.org) dashboard for HSL Fee Collection, using TypeScript, Tailwind CSS, Drizzle ORM, and PostgreSQL.

---

## 🚀 Getting Started

1. **Clone the repository & install dependencies:**

   ```bash
   npm install
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
| `npm run lint` | Lint |
| `npm run db:generate` | Generate migration from schema diff |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:studio` | Open Drizzle Studio |
| `npm run user:create` | Create a new user via CLI script |
| `npm test` | Run test suite (Vitest) |
| `npm run test:watch` | Run tests in watch mode |

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

Deploy easily on [Vercel](https://vercel.com/) or your preferred platform. See [Next.js deployment docs](https://nextjs.org/docs/app/building-your-application/deploying).
