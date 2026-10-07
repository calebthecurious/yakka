import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { LandingCta } from "@/components/landing/landing-cta";
import {
  EMPLOYER_CONTACT_EMAIL,
  LandingFooter,
  LandingNav,
  lpDisplay as display,
  lpFocusRing as focusRing,
  lpSecondary as secondary,
} from "@/components/landing/landing-chrome";
import { Constellation } from "@/components/profile/constellation";
import type { ConstellationData } from "@/lib/readiness/constellation";
import landingRecord from "@/data/landing-record.json";

/**
 * The landing page, built section for section from docs/design/landing-v2.pen
 * (PR-4a) with the PR-4b changes: a "For employers" nav link, the employer
 * band above the three steps, a line beneath the steps, and the primary CTA
 * repeated before the footer. Every colour, size and space is an `--lp-*`
 * token (src/styles/tokens.css); this file holds no literal of either.
 *
 * DATA. The Constellation renders src/data/landing-record.json — the dev
 * fixture projected through the real ledger code at build time
 * (scripts/build-landing-fixture.ts, diffed by its test) and server-rendered
 * here. This page derives nothing and makes no database call. It is an
 * example record and says so.
 *
 * ANALYTICS. None. The profile-view beacon is mounted on /u/ only.
 */

export const metadata: Metadata = {
  title: "Provency — Evidence that survives the age of generated portfolios",
  description:
    "Paste a job description, build toward it, and keep a record of verified evidence — passed checks and finished artefacts — that survives generated résumés and portfolios.",
  openGraph: {
    title: "Provency — the verification layer for self-taught knowledge workers",
    description:
      "Paste a target job description. Get a personalized roadmap, an unmistakable place to start, and a public record of verified evidence.",
    type: "website",
    siteName: "Provency",
  },
  twitter: {
    card: "summary_large_image",
    title: "Provency — evidence that survives the age of generated portfolios",
    description:
      "A record of verified evidence — passed checks and finished artefacts — built from any job description.",
  },
};

const EMPLOYER_MAILTO = `mailto:${EMPLOYER_CONTACT_EMAIL}?subject=${encodeURIComponent("Provency pilot")}`;

/**
 * The JSON is produced from `ConstellationData` by the build script and the
 * test asserts it is byte-identical to a fresh projection, so the shape is
 * guaranteed upstream; the cast only restores the union types JSON flattens.
 */
const record = landingRecord as unknown as ConstellationData;

const STEPS: readonly { n: string; line: string }[] = [
  { n: "01", line: "Paste the role you're aiming for." },
  { n: "02", line: "Build toward it and log the evidence." },
  { n: "03", line: "Share a record anyone can check." },
];

const TRUST_LINE = "Free to start · No credit card · ~2 minutes to your first roadmap";

export default async function Home() {
  // Logged-in users skip the marketing page and go straight to the app.
  const user = await getCurrentUser();
  if (user) redirect("/syllabi");

  return (
    <main className="bg-(--lp-bg) text-(--lp-text-primary) font-(family-name:--lp-font-text) flex flex-1 flex-col">
      <LandingNav />
      <Hero />
      <Record />
      <Employers />
      <Steps />
      <FinalCta />
      <LandingFooter />
    </main>
  );
}

/* ─────────────────────────────── Hero ───────────────────────────────── */

function Hero() {
  return (
    <section className="flex w-full flex-col items-center gap-(--lp-space-4) px-(--lp-gutter) pt-(--lp-hero-top) text-center max-md:gap-(--lp-space-3)">
      <h1
        className={`${display} max-w-(--lp-measure-headline) text-(length:--lp-size-display-xl) leading-(--lp-leading-display-xl) tracking-(--lp-tracking-display-xl) text-balance`}
      >
        Evidence that survives the age of generated portfolios.
      </h1>

      <p
        className={`${secondary} max-w-(--lp-measure-lead) text-(length:--lp-size-text-lg) leading-(--lp-leading-body) text-pretty`}
      >
        Résumés are generated, portfolios are free to fabricate, take-homes are
        solved in ninety seconds. Paste the role you&apos;re aiming for, build
        toward it, and keep a record of evidence — checks passed, artefacts
        finished — that a hiring manager can trust.
      </p>

      <CtaGroup />
    </section>
  );
}

/** Primary CTA + trust line. Used in the hero and again before the footer. */
function CtaGroup() {
  return (
    <div className="flex w-full max-w-(--lp-measure-lead) flex-col items-center gap-(--lp-space-2) pt-(--lp-space-2) max-md:pt-(--lp-space-1)">
      <LandingCta next="/syllabi" label="Start my record" className="w-full md:w-auto" />
      <p className={`${secondary} text-(length:--lp-size-text-xs) text-balance`}>{TRUST_LINE}</p>
    </div>
  );
}

/* ──────────────────────────── The record ────────────────────────────── */

function Record() {
  return (
    <section
      aria-labelledby="record-heading"
      className="flex w-full flex-col items-center gap-(--lp-space-6) px-(--lp-gutter) pt-(--lp-section-gap) max-md:gap-(--lp-space-4)"
    >
      <h2
        id="record-heading"
        className={`${display} max-w-(--lp-measure-heading) text-center text-(length:--lp-size-display-lg) leading-(--lp-leading-display-lg) tracking-(--lp-tracking-display-lg) text-balance`}
      >
        A public profile that shows you can do the work
      </h2>

      <div className="w-full max-w-(--lp-measure-map)">
        <Constellation data={record} variant="landing" compact className="lg:grid-cols-1" />
      </div>

      <p className={`${secondary} text-center text-(length:--lp-size-text-xs)`}>
        Example record — not a real profile.
      </p>
    </section>
  );
}

/* ──────────────────────────── Employer band ─────────────────────────── */

function Employers() {
  return (
    <section
      id="employers"
      aria-labelledby="employers-heading"
      className="flex w-full scroll-mt-(--lp-space-6) flex-col items-center gap-(--lp-space-3) px-(--lp-gutter) pt-(--lp-section-gap) text-center"
    >
      <h2
        id="employers-heading"
        className={`${display} max-w-(--lp-measure-positioning) text-(length:--lp-size-display-lg) leading-(--lp-leading-display-lg) tracking-(--lp-tracking-display-lg) text-balance`}
      >
        LinkedIn shows who you know and what you claim. Provency shows what you
        can do — and proves it.
      </h2>
      <p
        className={`${secondary} max-w-(--lp-measure-sentence) text-(length:--lp-size-text-lg) leading-(--lp-leading-body) text-pretty`}
      >
        A record keeps claims separate from evidence: every verified concept is
        backed by a passed competency check or a finished artefact, dated, and
        open for you to inspect.
      </p>
      <div className="w-full max-w-(--lp-measure-lead) pt-(--lp-space-2) max-md:pt-(--lp-space-1)">
        <a
          href={EMPLOYER_MAILTO}
          className={`${focusRing} inline-flex items-center justify-center rounded-(--lp-radius-pill) border border-(--lp-line) px-(--lp-cta-secondary-pad-x) py-(--lp-cta-secondary-pad-y) text-(length:--lp-size-text-md) font-medium transition-colors hover:border-(--lp-text-secondary) motion-reduce:transition-none max-md:w-full`}
        >
          Talk to us about a pilot
        </a>
      </div>
    </section>
  );
}

/* ─────────────────────────────── Steps ──────────────────────────────── */

function Steps() {
  return (
    <section
      aria-label="How it works"
      className="flex w-full flex-col gap-(--lp-space-6) px-(--lp-gutter) pt-(--lp-section-gap) max-md:gap-(--lp-space-4)"
    >
      <ol className="grid grid-cols-1 gap-(--lp-space-6) md:grid-cols-3 max-md:gap-(--lp-space-4)">
        {STEPS.map((s) => (
          <li key={s.n} className="flex flex-col gap-(--lp-space-2) max-md:gap-(--lp-space-1)">
            <span
              aria-hidden
              className={`${display} ${secondary} text-(length:--lp-size-display-md) leading-none`}
            >
              {s.n}
            </span>
            <p className="text-(length:--lp-size-text-lg) leading-(--lp-leading-step)">{s.line}</p>
          </li>
        ))}
      </ol>
      <p
        className={`${secondary} max-w-(--lp-measure-positioning) text-(length:--lp-size-text-lg) leading-(--lp-leading-body) text-pretty`}
      >
        Employers define the role standard; candidates build toward it; the
        record proves it.
      </p>
    </section>
  );
}

/* ──────────────────────────── Final CTA ─────────────────────────────── */

function FinalCta() {
  return (
    <section
      aria-label="Start"
      className="flex w-full flex-col items-center px-(--lp-gutter) pt-(--lp-section-gap) text-center"
    >
      <CtaGroup />
    </section>
  );
}
