import { describe, it, expect } from "vitest";
import { RESERVED_HANDLES, handleSchema, isReservedHandle } from "./profile";

describe("handleSchema — reserved handles", () => {
  it("rejects the /u/ route segments that a profile would shadow", () => {
    expect(handleSchema.safeParse("beacon").success).toBe(false);
    expect(handleSchema.safeParse("dev-constellation").success).toBe(false);
  });

  it("rejects case variants, since handles are lower-cased first", () => {
    expect(handleSchema.safeParse("Beacon").success).toBe(false);
    expect(handleSchema.safeParse("  DEV-CONSTELLATION ").success).toBe(false);
    expect(handleSchema.safeParse("Provency").success).toBe(false);
  });

  it("rejects every entry in the list, and the list only holds valid-shaped handles", () => {
    for (const h of RESERVED_HANDLES) {
      expect(isReservedHandle(h)).toBe(true);
      expect(handleSchema.safeParse(h).success).toBe(false);
      // Each reserved word must be something the shape rule would otherwise
      // ALLOW, or the entry is dead weight (e.g. "u" is 1 char and already
      // fails min(3) — kept anyway as documentation of intent).
      expect(h).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("gives a reserved-specific message, not the shape message", () => {
    const r = handleSchema.safeParse("beacon");
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.map((i) => i.message)).toContain(
        "That handle is reserved. Please choose another.",
      );
    }
  });

  it("still accepts ordinary handles, including ones that merely contain a reserved word", () => {
    expect(handleSchema.safeParse("caleb").success).toBe(true);
    expect(handleSchema.safeParse("fixture-fiona").success).toBe(true);
    expect(handleSchema.safeParse("beacon-hill").success).toBe(true);
    expect(handleSchema.safeParse("dev-constellation-2").success).toBe(true);
    expect(handleSchema.parse("  Caleb  ")).toBe("caleb");
  });

  it("keeps the existing shape rules", () => {
    expect(handleSchema.safeParse("ab").success).toBe(false);
    expect(handleSchema.safeParse("-abc").success).toBe(false);
    expect(handleSchema.safeParse("abc-").success).toBe(false);
    expect(handleSchema.safeParse("a".repeat(33)).success).toBe(false);
    expect(handleSchema.safeParse("has space").success).toBe(false);
  });
});
