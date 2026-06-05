## HSL Fee Collection Dashboard

This is a [Next.js](https://nextjs.org) dashboard for HSL Fee Collection, using TypeScript, Tailwind CSS, Drizzle ORM, and PostgreSQL.

---

## 🚀 Getting Started

1. **Clone the repository & install dependencies:**

   ```bash
   npm install
   ```

2. **Configure environment variables:**

   Create a `.env.local` file in the project root with:

   ```env
   # Database (Neon / PostgreSQL)
   DATABASE_URL=your_postgres_connection_string

   # Auth (NextAuth v5)
   AUTH_SECRET=your_auth_secret

   # Chronicle API
   CHRONICLE_API_URL=https://api.chroniclelegal.com
   CHRONICLE_BASE_URL=https://app.chroniclelegal.com
   CHRONICLE_API_KEY=your_chronicle_api_key

   # MyCase
   MYCASE_API_URL=your_mycase_api_url
   MYCASE_API_KEY=your_mycase_api_key
   MYCASE_DB_URL=your_mycase_db_connection_string

   # Webhooks
   SHEETS_SYNC_WEBHOOK_URL=your_sheets_sync_webhook_url
   SHEETS_PUSH_WEBHOOK_URL=your_sheets_push_webhook_url
   FEES_CLOSED_SYNC_WEBHOOK_URL=your_fees_closed_sync_webhook_url

   # Misc
   CALLTOOLS_API_KEY=your_calltools_api_key
   ```

   _Do not commit secrets!_

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
