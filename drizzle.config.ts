import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

config({ path: ".env.local" });

/**
 * drizzle-kit is a LOCAL tool: generate / studio / push run against the local
 * Supabase stack only. There is no DATABASE_URL anywhere in this repo
 * (Amendment 2): production credentials live solely in Vercel as
 * PROD_DATABASE_URL, and applying migrations to prod goes through
 * `npm run db:migrate` (scripts/migrate.ts --env prod) with its typed-PROD
 * ceremony — never through drizzle-kit.
 */
const url = process.env.DEV_DATABASE_URL;
if (!url) {
  throw new Error(
    "DEV_DATABASE_URL is not set. Run `supabase start`, then record `supabase status -o env` values in .env.local.",
  );
}
const host = new URL(url).hostname;
if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(host)) {
  throw new Error(
    `DEV_DATABASE_URL points at "${host}", which is not loopback. drizzle-kit may only target the local stack.`,
  );
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
