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
   DATABASE_URL=your_postgres_connection_string
   CHRONICLE_API_URL=https://api.chroniclelegal.com
   CHRONICLE_API_KEY=your_chronicle_api_key
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
- To run migrations (if using drizzle-kit):

  ```bash
  npx drizzle-kit push
  ```

---

## 🛠️ Scripts

- **Start dev server:** `npm run dev`
- **Build for production:** `npm run build`
- **Start production server:** `npm start`
- **Lint:** `npm run lint`

---

## 📦 Main Tech Stack

- Next.js (App Router, TypeScript)
- Tailwind CSS
- Drizzle ORM (PostgreSQL)
- React, Radix UI, React Hook Form, Zod, Recharts, etc.

---

## 📝 Project Structure

- `src/app/` — App routes and pages
- `src/components/` — UI and dashboard components
- `src/lib/` — Utilities, context, API clients, and DB schema
- `src/services/api.ts` — API request helpers

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
