import { describe, it, expect } from "vitest";
import {
  FREE_TIER_ACTIVE_SYLLABI_DEFAULT,
  PREMIUM_WILL_INCLUDE,
  WALL_COPY,
  canCreateSyllabus,
  countsAsActive,
  readEntitlementConfig,
} from "./entitlements";

describe("readEntitlementConfig", () => {
  it("defaults to one active syllabus and premium mode 'coming'", () => {
    expect(readEntitlementConfig({})).toEqual({ freeActiveSyllabi: 1, premiumMode: "coming" });
    expect(FREE_TIER_ACTIVE_SYLLABI_DEFAULT).toBe(1);
  });

  it("reads a valid integer limit and the stripe mode", () => {
    expect(readEntitlementConfig({ FREE_TIER_ACTIVE_SYLLABI: "3", PREMIUM_MODE: "stripe" })).toEqual({
      freeActiveSyllabi: 3,
      premiumMode: "stripe",
    });
  });

  it("falls back to defaults on garbage — never a zero or negative limit", () => {
    expect(readEntitlementConfig({ FREE_TIER_ACTIVE_SYLLABI: "0" }).freeActiveSyllabi).toBe(1);
    expect(readEntitlementConfig({ FREE_TIER_ACTIVE_SYLLABI: "-2" }).freeActiveSyllabi).toBe(1);
    expect(readEntitlementConfig({ FREE_TIER_ACTIVE_SYLLABI: "lots" }).freeActiveSyllabi).toBe(1);
    expect(readEntitlementConfig({ FREE_TIER_ACTIVE_SYLLABI: "2.5" }).freeActiveSyllabi).toBe(2);
    expect(readEntitlementConfig({ PREMIUM_MODE: "paypal" }).premiumMode).toBe("coming");
  });
});

describe("countsAsActive", () => {
  it("generating and ready count; permanently failed does not", () => {
    expect(countsAsActive("generating")).toBe(true);
    expect(countsAsActive("ready")).toBe(true);
    expect(countsAsActive("failed")).toBe(false);
  });
});

describe("canCreateSyllabus", () => {
  const cfg = readEntitlementConfig({});
  it("first workspace is unaffected; the second hits the wall", () => {
    expect(canCreateSyllabus(0, cfg)).toEqual({ allowed: true, limit: 1, active: 0 });
    expect(canCreateSyllabus(1, cfg)).toEqual({ allowed: false, limit: 1, active: 1 });
    expect(canCreateSyllabus(4, cfg)).toMatchObject({ allowed: false });
  });
  it("respects a raised limit", () => {
    const three = readEntitlementConfig({ FREE_TIER_ACTIVE_SYLLABI: "3" });
    expect(canCreateSyllabus(2, three).allowed).toBe(true);
    expect(canCreateSyllabus(3, three).allowed).toBe(false);
  });
});

describe("wall copy — no dark patterns", () => {
  const all = [
    WALL_COPY.title,
    WALL_COPY.body(1, 1),
    WALL_COPY.body(1, 3),
    WALL_COPY.listIntro,
    WALL_COPY.honesty,
    WALL_COPY.back,
    WALL_COPY.actionMessage(1),
    ...PREMIUM_WILL_INCLUDE,
  ].join(" ").toLowerCase();

  it("states plainly that nothing is for sale and there is no waiting list", () => {
    expect(WALL_COPY.body(1, 1)).toContain("nothing to buy today");
    expect(WALL_COPY.body(1, 1)).toContain("no waiting list");
  });

  it("tells the truth about how many the account has, including accounts over the limit from before", () => {
    expect(WALL_COPY.body(1, 1)).toContain("You already have one.");
    expect(WALL_COPY.body(1, 3)).toContain("You already have 3, created before this boundary — they stay free.");
    expect(WALL_COPY.body(2, 2)).toContain("You already have 2.");
  });

  it("names what premium will include", () => {
    expect(PREMIUM_WILL_INCLUDE.length).toBeGreaterThanOrEqual(3);
    expect(all).toContain("next-level maps");
    expect(all).toContain("current-role");
  });

  it("uses no urgency, scarcity, or price language", () => {
    for (const w of ["only ", "hurry", "limited time", "expires", "last chance", "$", "€", "£", "per month", "/mo", "upgrade now", "unlock"]) {
      expect(all).not.toContain(w);
    }
  });

  it("tells the user their existing work is safe and how a failed slot frees", () => {
    expect(WALL_COPY.honesty).toContain("unaffected");
    expect(WALL_COPY.honesty).toContain("permanently failed");
  });

  it("pluralises the limit honestly", () => {
    expect(WALL_COPY.body(1, 1)).toContain("one active syllabus");
    expect(WALL_COPY.body(3, 3)).toContain("3 active syllabi");
  });
});
