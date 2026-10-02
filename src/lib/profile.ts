import { z } from "zod";

/**
 * Shared validation for the public-facing parts of a profile. Used by the
 * first-login handle picker (`/profile/setup`) and by `/settings`.
 */

/**
 * Handles a user may NOT take. Two kinds:
 *  - static segments that live under /u/ and would be shadowed by a profile
 *    of the same name: the dwell beacon route and the dev-only Constellation
 *    preview (both sit under /u/ because the auth middleware redirects every
 *    other prefix to /login);
 *  - top-level app routes and brand/system words, so a profile URL can never
 *    be mistaken for an official page or a future route.
 * Checked after lower-casing, so case variants are covered. Existing holders
 * are unaffected — this validates new and changed handles only.
 */
export const RESERVED_HANDLES: ReadonlySet<string> = new Set([
  // /u/<segment> routes
  "beacon",
  "dev-constellation",
  // app routes
  "api",
  "auth",
  "login",
  "signup",
  "logout",
  "settings",
  "profile",
  "syllabi",
  "syllabus",
  "concepts",
  "clusters",
  "artefacts",
  "dev",
  "u",
  // brand / system
  "provency",
  "admin",
  "root",
  "support",
  "help",
  "about",
  "www",
  "mail",
  "null",
  "undefined",
  "me",
  "new",
  "edit",
]);

export function isReservedHandle(handle: string): boolean {
  return RESERVED_HANDLES.has(handle.trim().toLowerCase());
}

export const handleSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Handle must be at least 3 characters.")
  .max(32, "Handle must be 32 characters or fewer.")
  .regex(
    /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/,
    "Use lowercase letters, numbers, and hyphens. Start and end with a letter or number.",
  )
  .refine((h) => !isReservedHandle(h), {
    message: "That handle is reserved. Please choose another.",
  });

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, "Display name is required.")
  .max(60, "Display name must be 60 characters or fewer.");
