import { describe, expect, it } from "vitest";
import { databaseTargetFor, isLoopbackHost, resolveDatabaseUrl } from "./env";

const DEV = "postgresql://postgres:pw@127.0.0.1:54322/postgres";
const REMOTE = "postgresql://postgres.ref:pw@db.fake-not-prod.example.com:6543/postgres";

describe("databaseTargetFor", () => {
  it("reads PROD_DATABASE_URL only on Vercel", () => {
    expect(databaseTargetFor({ VERCEL: "1" })).toBe("PROD_DATABASE_URL");
    expect(databaseTargetFor({})).toBe("DEV_DATABASE_URL");
    expect(databaseTargetFor({ NODE_ENV: "production" })).toBe("DEV_DATABASE_URL");
  });
});

describe("resolveDatabaseUrl", () => {
  it("local runtime uses DEV_DATABASE_URL and ignores everything else", () => {
    expect(resolveDatabaseUrl({ DEV_DATABASE_URL: DEV, PROD_DATABASE_URL: REMOTE, DATABASE_URL: REMOTE })).toBe(DEV);
  });

  it("local runtime refuses a non-loopback DEV_DATABASE_URL", () => {
    expect(() => resolveDatabaseUrl({ DEV_DATABASE_URL: REMOTE })).toThrow(/not loopback/);
  });

  it("local runtime never reads a legacy DATABASE_URL", () => {
    expect(() => resolveDatabaseUrl({ DATABASE_URL: DEV })).toThrow(/DEV_DATABASE_URL/);
    expect(() => resolveDatabaseUrl({ DATABASE_URL: REMOTE })).toThrow(/DEV_DATABASE_URL/);
  });

  it("Vercel runtime uses PROD_DATABASE_URL and ignores DEV_DATABASE_URL", () => {
    expect(resolveDatabaseUrl({ VERCEL: "1", PROD_DATABASE_URL: REMOTE, DEV_DATABASE_URL: DEV })).toBe(REMOTE);
  });

  it("Vercel runtime fails loudly when PROD_DATABASE_URL is missing, even if DATABASE_URL is set", () => {
    expect(() => resolveDatabaseUrl({ VERCEL: "1", DATABASE_URL: REMOTE })).toThrow(/PROD_DATABASE_URL/);
    expect(() => resolveDatabaseUrl({ VERCEL: "1" })).toThrow(/Vercel Project Settings/);
  });

  it("error messages never include a connection string", () => {
    let message = "";
    try {
      resolveDatabaseUrl({ DEV_DATABASE_URL: REMOTE });
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    }
    expect(message).not.toContain("pw@");
  });
});

describe("isLoopbackHost", () => {
  it("accepts only loopback names", () => {
    expect(isLoopbackHost("127.0.0.1")).toBe(true);
    expect(isLoopbackHost("localhost")).toBe(true);
    expect(isLoopbackHost("aws-1-ap-northeast-2.pooler.supabase.com")).toBe(false);
  });
});
