import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL!;

// Connection for Supabase Transaction mode (port 6543)
// prepare: false is required for transaction pooler
const client = postgres(connectionString, { prepare: false });

export const db = drizzle(client, { schema });
