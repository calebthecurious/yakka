import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getDatabaseUrl } from "@/lib/env";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  client?: ReturnType<typeof postgres>;
  db?: ReturnType<typeof createDb>;
};

let dbInstance: ReturnType<typeof createDb> | undefined;

function createClient() {
  return globalForDb.client ?? postgres(getDatabaseUrl(), {
    prepare: false,
  });
}

function createDb() {
  const client = createClient();

  if (process.env.NODE_ENV !== "production") {
    globalForDb.client = client;
  }

  return drizzle(client, { schema });
}

function getDb() {
  dbInstance ??= globalForDb.db ?? createDb();
  return dbInstance;
}

export const db = new Proxy({} as ReturnType<typeof createDb>, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});

export type Db = ReturnType<typeof createDb>;
