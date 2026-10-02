import { describe, it, expect } from "vitest";
import {
  DEFAULT_SYLLABUS_PURPOSE,
  SYLLABUS_PURPOSES,
  isSyllabusPurpose,
  syllabusPurposeInput,
} from "./syllabus-purpose";
import { syllabusPurpose } from "@/db/schema";

describe("syllabus purpose (W-1)", () => {
  it("mirrors the pg enum exactly — change both or neither", () => {
    expect([...SYLLABUS_PURPOSES]).toEqual([...syllabusPurpose.enumValues]);
  });

  it("defaults to get_hired when the input is absent, null, or empty — zero behaviour change for existing callers", () => {
    expect(DEFAULT_SYLLABUS_PURPOSE).toBe("get_hired");
    expect(syllabusPurposeInput.parse(undefined)).toBe("get_hired");
    expect(syllabusPurposeInput.parse(null)).toBe("get_hired");
    expect(syllabusPurposeInput.parse("")).toBe("get_hired");
  });

  it("accepts both purposes and rejects anything else", () => {
    expect(syllabusPurposeInput.parse("get_hired")).toBe("get_hired");
    expect(syllabusPurposeInput.parse("current_role")).toBe("current_role");
    expect(syllabusPurposeInput.safeParse("promotion").success).toBe(false);
    expect(syllabusPurposeInput.safeParse("GET_HIRED").success).toBe(false);
    expect(syllabusPurposeInput.safeParse(42).success).toBe(false);
  });

  it("type guard agrees with the validator", () => {
    expect(isSyllabusPurpose("current_role")).toBe(true);
    expect(isSyllabusPurpose("nope")).toBe(false);
    expect(isSyllabusPurpose(null)).toBe(false);
  });
});
