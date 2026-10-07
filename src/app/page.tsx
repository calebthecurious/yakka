import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { LandingCta } from "@/components/landing/landing-cta";
import { Constellation } from "@/components/profile/constellation";
import type { ConstellationData } from "@/lib/readiness/constellation";
import landingRecord from "@/data/landing-record.json";

/**
 * The landing page, built section for section from docs/design/landing-v2.pen
 * (PR-4a → PR-4b). Six sections, nothing else: nav, hero, the Constellation,
 * three steps, the employer band, footer. Every colour, size and space is an
 * `--lp-*` token (globals.css), exported 1:1 from the pen variables.
 *
 * DATA. The Constellation renders src/data/landing-record.json — the dev
 * fixture projected through the real ledger code at build time
 * (scripts/build-landing-fixture.ts, diffed by its test). This page derives
 * nothing and makes no database call. It is an example record and says so.
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

/**
 * FILL before push: the address the employer cold emails went from. Not in the
 * repo, so it could not be filled here; the PR-4b decision names it. Until it
 * is set, the employer CTA is a mailto with no recipient.
 */
const EMPLOYER_CONTACT_EMAIL = "";

/**
 * The JSON is produced from `ConstellationData` by the build script and the
 * test asserts it is byte-identical to a fresh projection, so the shape is
 * guaranteed upstream; the cast only restores the union types JSON flattens.
 */
const record = landingRecord as unknown as ConstellationData;

const STEPS: readonly { n: string; line: string }[] = [
  { n: "01", line: "Paste the role you're aiming for." },
  { n: "02", line: "Build toward it and log the evidence." },
  { n: "03", line: "Share a record a hiring manager can check." },
];

/* Shared token classes — the two faces and the two greys, nothing else. */
const display = "font-(family-name:--lp-font-display) font-normal";
const secondary = "text-(--lp-text-secondary)";
const focusRing =
  "outline-none focus-visible:ring-[3px] focus-visible:ring-(--lp-text-primary)/60 focus-visible:ring-offset-2 focus-visible:ring-offset-(--lp-bg)";

export default async function Home() {
  // Logged-in users skip the marketing page and go straight to the app.
  const user = await getCurrentUser();
  if (user) redirect("/syllabi");

  return (
    <main className="bg-(--lp-bg) text-(--lp-text-primary) font-(family-name:--lp-font-text) flex flex-1 flex-col">
      <LandingNav />
      <Hero />
      <Record />
      <Steps />
      <Employers />
      <Footer />
    </main>
  );
}

/* ─────────────────────────────── Nav ────────────────────────────────── */

function LandingNav() {
  return (
    <header className="flex w-full items-center justify-between px-(--lp-gutter) py-(--lp-space-3) max-md:py-(--lp-space-2)">
      <Link
        href="/"
        className={`${display} ${focusRing} rounded-sm text-(length:--lp-size-display-md) tracking-[-0.5px]`}
      >
        Provency
      </Link>
      <Link
        href="/login"
        className={`${focusRing} rounded-sm text-(length:--lp-size-text-sm) hover:opacity-80`}
      >
        Log in
      </Link>
    </header>
  );
}

/* ─────────────────────────────── Hero ───────────────────────────────── */

function Hero() {
  return (
    <section className="flex w-full flex-col items-center gap-(--lp-space-4) px-(--lp-gutter) pt-(--lp-space-12) text-center max-md:gap-(--lp-space-3) max-md:pt-(--lp-space-8)">
      <h1
        className={`${display} max-w-[960px] text-(length:--lp-size-display-xl) leading-[1.04] tracking-[-2px] text-balance max-md:leading-[1.06] max-md:tracking-[-1px]`}
      >
        Evidence that survives the age of generated portfolios.
      </h1>

      <p
        className={`${secondary} max-w-[600px] text-(length:--lp-size-text-lg) leading-[1.6] text-pretty`}
      >
        Résumés are generated, portfolios are free to fabricate, take-homes are
        solved in ninety seconds. Paste the role you&apos;re aiming for, build
        toward it, and keep a record of evidence — checks passed, artefacts
        finished — that a hiring manager can trust.
      </p>

      <div className="flex w-full max-w-[600px] flex-col items-center gap-(--lp-space-2) pt-(--lp-space-2) max-md:pt-(--lp-space-1)">
        <LandingCta next="/syllabi" label="Start my record" className="md:w-auto w-full" />
        <p className={`${secondary} text-(length:--lp-size-text-xs) text-balance`}>
          Free to start · No credit card · ~2 minutes to your first roadmap
        </p>
        <a
          href="#employers"
          className={`${secondary} ${focusRing} rounded-sm text-(length:--lp-size-text-sm) underline-offset-4 hover:text-(--lp-text-primary) hover:underline`}
        >
          Hiring? See what a record proves ↓
        </a>
      </div>
    </section>
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
        className={`${display} max-w-[760px] text-center text-(length:--lp-size-display-lg) leading-[1.1] tracking-[-0.8px] text-balance max-md:tracking-[-0.5px]`}
      >
        A public profile that shows you can do the work
      </h2>

      <div className="w-full max-w-[1094px]">
        <Constellation
          data={record}
          variant="landing"
          clusterLabels="md-up"
          className="lg:grid-cols-1"
        />
      </div>

      <p className={`${secondary} text-center text-(length:--lp-size-text-xs)`}>
        Example record — not a real profile.
      </p>
    </section>
  );
}

/* ─────────────────────────────── Steps ──────────────────────────────── */

function Steps() {
  return (
    <section aria-label="How it works" className="w-full px-(--lp-gutter) pt-(--lp-section-gap)">
      <ol className="grid grid-cols-1 gap-(--lp-space-6) md:grid-cols-3 max-md:gap-(--lp-space-4)">
        {STEPS.map((s) => (
          <li key={s.n} className="flex flex-col gap-(--lp-space-2) max-md:gap-(--lp-space-1)">
            <span
              aria-hidden
              className={`${display} ${secondary} text-(length:--lp-size-display-md) leading-none`}
            >
              {s.n}
            </span>
            <p className="text-(length:--lp-size-text-lg) leading-[1.45]">{s.line}</p>
          </li>
        ))}
      </ol>
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
        className={`${display} max-w-[820px] text-(length:--lp-size-display-lg) leading-[1.1] tracking-[-0.8px] text-balance max-md:tracking-[-0.5px]`}
      >
        LinkedIn shows who you know and what you claim. Provency shows what you
        can do — and proves it.
      </h2>
      <p
        className={`${secondary} max-w-[640px] text-(length:--lp-size-text-lg) leading-[1.6] text-pretty`}
      >
        A record keeps claims separate from evidence: every verified concept is
        backed by a passed competency check or a finished artefact, dated, and
        open for you to inspect.
      </p>
      <div className="w-full max-w-[600px] pt-(--lp-space-2) max-md:pt-(--lp-space-1)">
        <a
          href={`mailto:${EMPLOYER_CONTACT_EMAIL}`}
          className={`${focusRing} inline-flex items-center justify-center rounded-full border border-(--lp-line) px-6 py-[13px] text-(length:--lp-size-text-md) font-medium transition-colors hover:border-(--lp-text-secondary) motion-reduce:transition-none max-md:w-full`}
        >
          Talk to us about a pilot
        </a>
      </div>
    </section>
  );
}

/* ─────────────────────────────── Footer ─────────────────────────────── */

function Footer() {
  return (
    <footer className="flex w-full items-center justify-between px-(--lp-gutter) pt-(--lp-section-gap) pb-(--lp-space-6) max-md:flex-col max-md:items-start max-md:gap-(--lp-space-2) max-md:pb-(--lp-space-4)">
      <span className={`${display} text-[20px] tracking-[-0.3px]`}>Provency</span>
      <span className={`${secondary} text-(length:--lp-size-text-xs)`}>© 2026</span>
    </footer>
  );
}
