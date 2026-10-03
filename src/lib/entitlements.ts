/**
 * Entitlements (W-5). The free-tier boundary, marked honestly before billing
 * exists: one active syllabus per account, of any purpose. Everything above
 * it shows a "Premium coming" state — a plain statement of what premium will
 * include, no payment UI, no countdown, no fake scarcity.
 *
 * Config is env-driven so A8 can flip the mode to Stripe without touching
 * the rule:
 *   FREE_TIER_ACTIVE_SYLLABI   integer ≥ 1 (default 1)
 *   PREMIUM_MODE               "coming" (default) | "stripe" (A8)
 * Pure over an env record; the page/action pass process.env.
 */

export const FREE_TIER_ACTIVE_SYLLABI_DEFAULT = 1;
export type PremiumMode = "coming" | "stripe";

export interface EntitlementConfig {
  freeActiveSyllabi: number;
  premiumMode: PremiumMode;
}

export function readEntitlementConfig(
  env: Readonly<Record<string, string | undefined>>,
): EntitlementConfig {
  const raw = env.FREE_TIER_ACTIVE_SYLLABI;
  const parsed = raw == null ? NaN : Number.parseInt(raw, 10);
  const freeActiveSyllabi =
    Number.isInteger(parsed) && parsed >= 1 ? parsed : FREE_TIER_ACTIVE_SYLLABI_DEFAULT;
  const premiumMode: PremiumMode = env.PREMIUM_MODE === "stripe" ? "stripe" : "coming";
  return { freeActiveSyllabi, premiumMode };
}

/** A syllabus counts toward the boundary unless generation permanently failed. */
export function countsAsActive(status: "generating" | "ready" | "failed"): boolean {
  return status !== "failed";
}

export interface CreateDecision {
  allowed: boolean;
  limit: number;
  active: number;
}

/** May this account create another syllabus right now? */
export function canCreateSyllabus(activeCount: number, cfg: EntitlementConfig): CreateDecision {
  return {
    allowed: activeCount < cfg.freeActiveSyllabi,
    limit: cfg.freeActiveSyllabi,
    active: activeCount,
  };
}

/**
 * What premium will include, per Plan v2 A8. Stated plainly on the wall;
 * nothing here is for sale yet and the copy says so.
 */
export const PREMIUM_WILL_INCLUDE: readonly string[] = [
  "More than one active syllabus — including current-role workspaces alongside a get-hired path",
  "Next-Level Maps: what stands between you and the next level of your role",
  "Unlimited paths",
];

export const WALL_COPY = {
  title: "Premium is coming",
  /** `limit` is the free-tier count; `active` is what the account actually has. */
  body: (limit: number, active: number) => {
    const tier = limit === 1 ? "one active syllabus" : `${limit} active syllabi`;
    const have =
      active === 1
        ? "You already have one."
        : active > limit
          ? `You already have ${active}, created before this boundary — they stay free.`
          : `You already have ${active}.`;
    return `The free tier includes ${tier}. ${have} Another workspace will be part of Premium, which is not available yet — there is nothing to buy today and no waiting list to join.`;
  },
  listIntro: "Premium will include:",
  honesty:
    "Your existing syllabus is unaffected and stays free. If a syllabus has permanently failed to generate, deleting it frees the slot.",
  back: "Back to your syllabi",
  /** Returned by the action if a create slips past the page. */
  actionMessage: (limit: number) =>
    `The free tier includes ${limit === 1 ? "one active syllabus" : `${limit} active syllabi`}. Additional workspaces are part of Premium, which is coming — nothing to buy yet.`,
} as const;
