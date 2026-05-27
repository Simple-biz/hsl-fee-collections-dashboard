import "server-only";
import postgres from "postgres";

// Read-only connection to the MyCase mirror database — a separate Neon project,
// kept in sync from MyCase by an external (n8n) workflow. This app only ever
// SELECTs from it; never write here.
const connectionString = process.env.MYCASE_DB_URL!;

// Cached on globalThis so HMR reloads / warm serverless instances reuse the
// connection instead of paying the TLS handshake each time (see lib/db/index.ts).
const globalForMyCaseDb = globalThis as unknown as {
  _myCaseDb?: ReturnType<typeof postgres>;
};

export const myCaseDb =
  globalForMyCaseDb._myCaseDb ??
  postgres(connectionString, {
    max: 5,
    prepare: false,
    idle_timeout: 300,
    connect_timeout: 10,
  });

globalForMyCaseDb._myCaseDb = myCaseDb;
