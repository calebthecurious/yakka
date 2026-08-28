import { describe, expect, it } from "vitest";
import {
  CEREMONY_TOKEN,
  GuardError,
  assertInteractive,
  confirmationAccepted,
  describeUrl,
  parseEnvFlag,
  requiresCeremony,
  resolveTarget,
} from "./migrate-guard";

const DEV = "postgresql://postgres:pw@127.0.0.1:54322/postgres";
const REMOTE = "postgresql://postgres.ref:pw@db.fake-not-prod.example.com:6543/postgres";

describe("parseEnvFlag", () => {
  it("accepts --env dev and --env prod", () => {
    expect(parseEnvFlag(["--env", "dev"])).toBe("dev");
    expect(parseEnvFlag(["--env", "prod"])).toBe("prod");
    expect(parseEnvFlag(["--env=prod"])).toBe("prod");
  });

  it("fails with usage when the flag is missing", () => {
    expect(() => parseEnvFlag([])).toThrow(GuardError);
    expect(() => parseEnvFlag([])).toThrow(/--env is required/);
    expect(() => parseEnvFlag([])).toThrow(/usage:/);
  });

  it("rejects any other value — there is no default target", () => {
    expect(() => parseEnvFlag(["--env", "staging"])).toThrow(/must be dev or prod/);
    expect(() => parseEnvFlag(["--env"])).toThrow(/--env is required/);
    expect(() => parseEnvFlag(["--yes"])).toThrow(/--env is required/);
  });
});

describe("resolveTarget", () => {
  it("dev resolves DEV_DATABASE_URL and never DATABASE_URL", () => {
    const t = resolveTarget("dev", { DEV_DATABASE_URL: DEV, DATABASE_URL: REMOTE });
    expect(t.source).toBe("DEV_DATABASE_URL");
    expect(t.url).toBe(DEV);
    expect(t.host).toBe("127.0.0.1");
    expect(t.port).toBe("54322");
    expect(t.database).toBe("postgres");
  });

  it("dev refuses a non-loopback DEV_DATABASE_URL", () => {
    expect(() => resolveTarget("dev", { DEV_DATABASE_URL: REMOTE })).toThrow(/not loopback/);
  });

  it("dev fails when DEV_DATABASE_URL is unset, even if DATABASE_URL is set", () => {
    expect(() => resolveTarget("dev", { DATABASE_URL: REMOTE })).toThrow(/DEV_DATABASE_URL is not set/);
  });

  it("prod resolves PROD_DATABASE_URL", () => {
    const t = resolveTarget("prod", { PROD_DATABASE_URL: REMOTE });
    expect(t.source).toBe("PROD_DATABASE_URL");
    expect(t.host).toBe("db.fake-not-prod.example.com");
  });

  it("prod never falls back to a legacy DATABASE_URL", () => {
    expect(() => resolveTarget("prod", { DATABASE_URL: REMOTE })).toThrow(/PROD_DATABASE_URL is not set/);
  });

  it("prod fails when PROD_DATABASE_URL is unset", () => {
    expect(() => resolveTarget("prod", {})).toThrow(/PROD_DATABASE_URL is not set/);
  });

  it("prod ignores DEV_DATABASE_URL", () => {
    expect(() => resolveTarget("prod", { DEV_DATABASE_URL: DEV })).toThrow(GuardError);
  });
});

describe("describeUrl", () => {
  it("extracts host, port and database and never the password", () => {
    const d = describeUrl("postgresql://user:s3cret@host.example.com:6543/mydb");
    expect(d).toEqual({ host: "host.example.com", port: "6543", database: "mydb" });
    expect(JSON.stringify(d)).not.toContain("s3cret");
  });

  it("defaults port and database", () => {
    expect(describeUrl("postgresql://u:p@localhost/")).toEqual({ host: "localhost", port: "5432", database: "postgres" });
  });
});

describe("ceremony rules", () => {
  it("loopback hosts need no ceremony; everything else does", () => {
    expect(requiresCeremony("127.0.0.1")).toBe(false);
    expect(requiresCeremony("localhost")).toBe(false);
    expect(requiresCeremony("db.fake-not-prod.example.com")).toBe(true);
    expect(requiresCeremony("aws-1-ap-northeast-2.pooler.supabase.com")).toBe(true);
  });

  it("non-interactive stdin is a hard failure with no bypass", () => {
    expect(() => assertInteractive(false)).toThrow(/no --yes bypass/);
    expect(() => assertInteractive(undefined)).toThrow(GuardError);
    expect(() => assertInteractive(true)).not.toThrow();
  });

  it("only the exact token PROD is accepted", () => {
    expect(CEREMONY_TOKEN).toBe("PROD");
    expect(confirmationAccepted("PROD")).toBe(true);
    expect(confirmationAccepted("PROD\n")).toBe(true);
    expect(confirmationAccepted("PROD\r\n")).toBe(true);
    expect(confirmationAccepted("prod")).toBe(false);
    expect(confirmationAccepted(" PROD")).toBe(false);
    expect(confirmationAccepted("yes")).toBe(false);
    expect(confirmationAccepted("")).toBe(false);
  });
});
