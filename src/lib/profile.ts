import { z } from "zod";

/**
 * Shared validation for the public-facing parts of a profile. Used by the
 * first-login handle picker (`/profile/setup`) and by `/settings`.
 */

export const handleSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Handle must be at least 3 characters.")
  .max(32, "Handle must be 32 characters or fewer.")
  .regex(
    /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/,
    "Use lowercase letters, numbers, and hyphens. Start and end with a letter or number.",
  );

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, "Display name is required.")
  .max(60, "Display name must be 60 characters or fewer.");
