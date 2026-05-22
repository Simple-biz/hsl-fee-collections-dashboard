import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL!;

// Reuse one client across module reloads. In `next dev`, HMR re-evaluates this
// module on nearly every change/request; without caching, each reload opened a
// fresh connection and paid the (~2s) TLS + SCRAM handshake again. Caching on
// globalThis also lets warm serverless instances reuse the connection.
const globalForDb = globalThis as unknown as {
  _pgClient?: ReturnType<typeof postgres>;
};

const client =
  globalForDb._pgClient ??
  postgres(connectionString, {
    // Small pool so a page's data query and the background notification polls
    // run in parallel instead of serializing on a single connection.
    max: 10,
    // Neon's pooler (pgbouncer transaction mode) doesn't support prepared statements.
    prepare: false,
    // Keep the connection warm between user actions so refreshes don't reconnect.
    idle_timeout: 300,
    connect_timeout: 10,
  });

globalForDb._pgClient = client;

export const db = drizzle(client, { schema });
