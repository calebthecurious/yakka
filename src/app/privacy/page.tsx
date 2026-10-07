import type { Metadata } from "next";
import {
  EMPLOYER_CONTACT_EMAIL,
  LandingFooter,
  LandingNav,
  lpDisplay as display,
  lpFocusRing as focusRing,
  lpSecondary as secondary,
} from "@/components/landing/landing-chrome";

/**
 * /privacy — static, public (allow-listed in src/lib/supabase/middleware.ts),
 * linked from the landing footer. No auth call, no database call, no
 * analytics. Says what is collected and how to delete an account. Dated.
 */

export const metadata: Metadata = {
  title: "Privacy — Provency",
  description:
    "What Provency collects (your Google account email, the profile content you create, first-party page analytics), that no third-party scripts run, and how to delete your account.",
};

const UPDATED = "7 October 2026";

/** Account deletion is by email for now; same address as the employer CTA. */
const DELETE_MAILTO = `mailto:${EMPLOYER_CONTACT_EMAIL}?subject=${encodeURIComponent("Delete my Provency account")}`;

const COLLECTED: readonly { what: string; why: string }[] = [
  {
    what: "Your Google account email address.",
    why: "Used to create your account and sign you in. Nothing else is read from your Google account.",
  },
  {
    what: "The profile content you create.",
    why: "Syllabi, notes, competency checks, artefact links, and the evidence record built from them. Whatever you mark public appears on your public profile.",
  },
  {
    what: "First-party page analytics on public profiles.",
    why: "Which profile was viewed, which sections, a dwell-time bucket, the referrer, and a random per-session token. No third-party scripts run on this site.",
  },
];

export default function PrivacyPage() {
  return (
    <main className="bg-(--lp-bg) text-(--lp-text-primary) font-(family-name:--lp-font-text) flex flex-1 flex-col">
      <LandingNav />

      <article className="flex w-full flex-col gap-(--lp-space-6) px-(--lp-gutter) pt-(--lp-hero-top) max-md:gap-(--lp-space-4)">
        <header className="flex flex-col gap-(--lp-space-2)">
          <h1
            className={`${display} text-(length:--lp-size-display-lg) leading-(--lp-leading-display-lg) tracking-(--lp-tracking-display-lg)`}
          >
            Privacy
          </h1>
          <p className={`${secondary} text-(length:--lp-size-text-sm)`}>
            Last updated {UPDATED}
          </p>
        </header>

        <section
          aria-labelledby="collected-heading"
          className="flex max-w-(--lp-measure-positioning) flex-col gap-(--lp-space-3)"
        >
          <h2
            id="collected-heading"
            className={`${display} text-(length:--lp-size-display-md) tracking-(--lp-tracking-display-md)`}
          >
            What we collect
          </h2>
          <ul className="flex flex-col gap-(--lp-space-3)">
            {COLLECTED.map((c) => (
              <li key={c.what} className="flex flex-col gap-(--lp-space-1)">
                <p className="text-(length:--lp-size-text-lg) leading-(--lp-leading-step)">
                  {c.what}
                </p>
                <p
                  className={`${secondary} text-(length:--lp-size-text-md) leading-(--lp-leading-body) text-pretty`}
                >
                  {c.why}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section
          aria-labelledby="delete-heading"
          className="flex max-w-(--lp-measure-positioning) flex-col gap-(--lp-space-3)"
        >
          <h2
            id="delete-heading"
            className={`${display} text-(length:--lp-size-display-md) tracking-(--lp-tracking-display-md)`}
          >
            How to delete your account
          </h2>
          <p
            className={`${secondary} text-(length:--lp-size-text-md) leading-(--lp-leading-body) text-pretty`}
          >
            Email us from the address you signed up with and we will delete
            your account and everything in it.
          </p>
          <a
            href={DELETE_MAILTO}
            className={`${focusRing} inline-flex w-fit items-center justify-center rounded-(--lp-radius-pill) border border-(--lp-line) px-(--lp-cta-secondary-pad-x) py-(--lp-cta-secondary-pad-y) text-(length:--lp-size-text-md) font-medium transition-colors hover:border-(--lp-text-secondary) motion-reduce:transition-none max-md:w-full`}
          >
            Request account deletion
          </a>
        </section>
      </article>

      <LandingFooter />
    </main>
  );
}
