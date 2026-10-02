import { z } from "zod";

/**
 * Syllabus purpose (W-1). Mirrors the `syllabus_purpose` pg enum in
 * src/db/schema.ts; declared here so the create action, the W-2 intake and
 * any future reader share one validator and one default without importing
 * the ORM. If the enum changes, change both.
 */
export const SYLLABUS_PURPOSES = ["get_hired", "current_role"] as const;
export type SyllabusPurpose = (typeof SYLLABUS_PURPOSES)[number];

export const DEFAULT_SYLLABUS_PURPOSE: SyllabusPurpose = "get_hired";

/**
 * Form/action input. Absent, null, or empty → the default, so every existing
 * caller (none of which sends a purpose yet) is unchanged. Anything else must
 * be one of the enum values.
 */
export const syllabusPurposeInput = z.preprocess(
  (v) => (v == null || v === "" ? DEFAULT_SYLLABUS_PURPOSE : v),
  z.enum(SYLLABUS_PURPOSES),
);

export function isSyllabusPurpose(value: unknown): value is SyllabusPurpose {
  return typeof value === "string" && (SYLLABUS_PURPOSES as readonly string[]).includes(value);
}
