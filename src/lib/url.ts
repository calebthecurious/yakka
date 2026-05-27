import { z } from "zod";

/**
 * URL validation for values the app later renders as an `href`.
 *
 * Zod's `.url()` — like the `new URL()` constructor — accepts `javascript:` and
 * `data:` URLs. Stored and rendered in an anchor (including on the public
 * profile page), those become stored XSS. Restrict user-supplied URLs that
 * reach an href to http/https.
 */
function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

const DEFAULT_MESSAGE = "Enter a valid http(s) URL.";

/** Required http(s) URL. */
export function httpUrl(message: string = DEFAULT_MESSAGE) {
  return z.string().trim().refine(isHttpUrl, message);
}

/** Optional http(s) URL; an empty string is treated as omitted. */
export function optionalHttpUrl(message: string = DEFAULT_MESSAGE) {
  return z
    .string()
    .trim()
    .refine(isHttpUrl, message)
    .optional()
    .or(z.literal("").transform(() => undefined));
}
