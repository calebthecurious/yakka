import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { LandingCta } from "@/components/landing/landing-cta";

export const metadata: Metadata = {
  title: "Provency — Turn the job you want into the plan that gets you there",
  description:
    "Paste any job description and Provency builds you a personalized, source-grounded learning roadmap — from the exact first step to a public profile that proves you can do the work.",
  openGraph: {
    title: "Provency — the personal learning OS for self-taught knowledge workers",
    description:
      "Paste a target job description. Get a personalized roadmap, an unmistakable place to start, and a public profile that proves your progress.",
    type: "website",
    siteName: "Provency",
  },
  twitter: {
    card: "summary_large_image",
    title: "Provency — turn the job you want into the plan that gets you there",
    description:
      "Personalized, source-grounded learning roadmaps from any job description.",
  },
};

export default async function Home() {
  // Logged-in users skip the marketing page and go straight to the app.
  const user = await getCurrentUser();
  if (user) redirect("/syllabi");

  return (
    <main className="relative flex flex-col">
      <Hero />
      <Stats />
      <Features />
      <HowItWorks />
      <FounderNote />
      <Testimonials />
      <Faq />
      <FinalCta />
      <Footer />
    </main>
  );
}

/* ─────────────────────────────── Hero ───────────────────────────────── */

function Hero() {
  return (
    <section className="relative overflow-hidden px-6 pt-24 pb-28 sm:pt-32 sm:pb-36">
      <div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center text-center">
        <h1 className="font-serif text-5xl leading-[1.05] font-normal tracking-tight text-balance sm:text-7xl">
          Turn the job you want into the plan that gets you there.
        </h1>

        <p className="text-muted-foreground mx-auto mt-7 max-w-md text-base text-pretty sm:text-lg">
          Paste any job description. Provency builds a personalized,
          source-grounded learning roadmap — from the exact first step to a
          public profile that proves you can do the work.
        </p>

        <div className="mt-10 flex flex-col items-center gap-3">
          <LandingCta size="xl" next="/syllabi" label="Build my roadmap" />
          <p className="text-muted-foreground/70 text-xs">
            Free to start · No credit card · ~2 minutes to your first roadmap
          </p>
        </div>
      </div>

      {/* Signature flowing gradient ribbon — the hero's centerpiece. */}
      <FlowingGradient />
    </section>
  );
}

/**
 * One cohesive, organic gradient ribbon (warm gold → cool indigo → violet),
 * heavily blurred and masked into a flowing horizontal band. The staggered
 * vertical anchor points give it an undulating, hand-made feel rather than the
 * three-blob "aurora" look. Drifts slowly; static under reduced-motion.
 */
function FlowingGradient() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-[26rem] overflow-hidden"
    >
      <div
        className="mx-auto h-full w-full max-w-[1500px] opacity-70 blur-[64px] will-change-transform motion-safe:animate-[wave-drift_22s_ease-in-out_infinite]"
        style={{
          background:
            "radial-gradient(38% 85% at 10% 62%, rgba(244,176,84,0.55), transparent 70%)," +
            "radial-gradient(44% 95% at 38% 34%, rgba(120,140,255,0.5), transparent 72%)," +
            "radial-gradient(40% 88% at 66% 66%, rgba(150,120,255,0.45), transparent 72%)," +
            "radial-gradient(38% 82% at 90% 40%, rgba(244,182,120,0.42), transparent 72%)",
          maskImage:
            "linear-gradient(to bottom, transparent, black 35%, black 62%, transparent)",
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent, black 35%, black 62%, transparent)",
        }}
      />
    </div>
  );
}

/* ─────────────────────────────── Stats ──────────────────────────────── */

const STATS: { value: string; label: string }[] = [
  { value: "Any JD", label: "becomes a structured roadmap" },
  { value: "80+", label: "concepts, foundation → advanced" },
  { value: "1 click", label: "to an unmistakable place to start" },
  { value: "Public", label: "profile that proves your progress" },
];

function Stats() {
  return (
    <section className="border-border/40 border-y px-6 py-10">
      <div className="mx-auto grid max-w-5xl grid-cols-2 gap-x-8 gap-y-8 sm:grid-cols-4">
        {STATS.map((s) => (
          <div key={s.label} className="flex flex-col">
            <span className="font-serif text-3xl font-normal tracking-tight sm:text-4xl">
              {s.value}
            </span>
            <span className="text-muted-foreground mt-1.5 text-sm text-pretty">
              {s.label}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ────────────────────────────── Features ────────────────────────────── */

type Feature = {
  kicker: string;
  title: string;
  body: string;
  visual: React.ReactNode;
};

const FEATURES: Feature[] = [
  {
    kicker: "From the real role",
    title: "A roadmap built from the job, not a generic course list",
    body: "Paste the exact job description. Provency reads what the role actually assesses and turns it into a hierarchy of skill clusters, sub-skills, concepts, and curated resources — sequenced foundation to advanced.",
    visual: <RoadmapVisual />,
  },
  {
    kicker: "Start here",
    title: "Know exactly where to begin",
    body: "Every roadmap opens with a Start Here on-ramp: the baselines it assumes, and an ordered first step that's small and concrete. No more staring at a wall of topics wondering what comes first.",
    visual: <StartHereVisual />,
  },
  {
    kicker: "Grounded in the company",
    title: "Researched from public sources — never invented",
    body: "Company Insight studies your target employer from publicly available information only, keeping verified facts strictly separate from clearly-labelled inference. No hallucinated internal stack, no made-up details.",
    visual: <InsightVisual />,
  },
  {
    kicker: "Prove it",
    title: "A public profile that shows you can do the work",
    body: "Concepts verified, artefacts built, progress rendered — all on a shareable profile. Evidence you can put in front of a hiring manager instead of a line on a résumé.",
    visual: <ProofVisual />,
  },
];

function Features() {
  return (
    <section className="px-6 py-24 sm:py-28">
      <div className="mx-auto max-w-5xl">
        <div className="max-w-2xl">
          <h2 className="font-serif text-4xl leading-[1.1] font-normal tracking-tight text-balance sm:text-5xl">
            Not another course catalog. A plan for the job you&apos;re actually
            targeting.
          </h2>
          <p className="text-muted-foreground mt-5 text-lg text-pretty">
            Built around what gets you hired — clarity on where to start, what
            matters, and proof you can do the work.
          </p>
        </div>

        <div className="mt-20 flex flex-col gap-24">
          {FEATURES.map((f, i) => (
            <FeatureRow key={f.title} feature={f} flip={i % 2 === 1} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureRow({ feature, flip }: { feature: Feature; flip: boolean }) {
  return (
    <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16">
      <div className={cn(flip && "lg:order-2")}>
        <span className="text-muted-foreground/80 text-xs font-medium tracking-wide">
          {feature.kicker}
        </span>
        <h3 className="font-serif mt-3 text-2xl leading-snug font-normal tracking-tight text-balance sm:text-3xl">
          {feature.title}
        </h3>
        <p className="text-muted-foreground mt-4 text-base leading-relaxed text-pretty">
          {feature.body}
        </p>
      </div>
      <div className={cn(flip && "lg:order-1")}>{feature.visual}</div>
    </div>
  );
}

/* ── Bespoke feature visuals (restrained mock panels, no icon-card grid) ── */

function VisualFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-border/60 from-card/70 to-card/30 relative overflow-hidden rounded-2xl border bg-gradient-to-b p-5 sm:p-6">
      {children}
    </div>
  );
}

function RoadmapVisual() {
  const clusters: { name: string; concepts: string[] }[] = [
    {
      name: "Neural Signal Processing",
      concepts: ["Sampling & quantization", "Spike detection", "Artifact removal"],
    },
    {
      name: "Embedded Systems",
      concepts: ["Job scheduling", "Low-latency streaming"],
    },
    {
      name: "Data Systems Fundamentals",
      concepts: ["Columnar storage", "Indexing strategies"],
    },
  ];
  return (
    <VisualFrame>
      <div className="text-muted-foreground mb-4 flex items-center justify-between text-xs">
        <span className="font-medium">Software Engineer · Data Engineering</span>
        <span className="border-border/60 rounded-full border px-2 py-0.5">
          Example
        </span>
      </div>
      <div className="flex flex-col gap-3.5">
        {clusters.map((c) => (
          <div key={c.name} className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{c.name}</span>
            <ul className="border-border/50 ml-px flex flex-col gap-1 border-l pl-4">
              {c.concepts.map((concept) => (
                <li
                  key={concept}
                  className="text-muted-foreground flex items-center gap-2 text-xs"
                >
                  <span className="bg-foreground/30 size-1 rounded-full" />
                  {concept}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="text-muted-foreground/60 mt-4 text-[11px]">
        Illustrative excerpt. Real roadmaps run 80+ concepts across every cluster
        the role demands.
      </p>
    </VisualFrame>
  );
}

function StartHereVisual() {
  const baselines = ["Comfortable with Python", "Basic linear algebra"];
  const steps = [
    { n: "01", label: "Read: sampling theorem (20 min)", done: true },
    { n: "02", label: "Implement a moving-average filter", done: false },
    { n: "03", label: "Note: when aliasing bites", done: false },
  ];
  return (
    <VisualFrame>
      <span className="text-muted-foreground text-xs font-medium">Start here</span>
      <div className="mt-3 flex flex-col gap-2">
        <span className="text-muted-foreground/70 text-[11px] tracking-wide">
          Assumes you already have
        </span>
        {baselines.map((b) => (
          <div key={b} className="flex items-center gap-2 text-xs">
            <span className="border-border/70 flex size-4 items-center justify-center rounded-full border">
              <span className="bg-foreground/70 size-1.5 rounded-full" />
            </span>
            <span className="text-muted-foreground">{b}</span>
          </div>
        ))}
      </div>
      <div className="border-border/40 mt-4 flex flex-col gap-2 border-t pt-4">
        <span className="text-muted-foreground/70 text-[11px] tracking-wide">
          Your first ordered steps
        </span>
        {steps.map((s) => (
          <div key={s.n} className="flex items-center gap-3 text-xs">
            <span
              className={cn(
                "tabular-nums",
                s.done ? "text-foreground/50 line-through" : "text-foreground",
              )}
            >
              {s.n}
            </span>
            <span className={cn(s.done ? "text-muted-foreground/50" : "")}>
              {s.label}
            </span>
          </div>
        ))}
      </div>
    </VisualFrame>
  );
}

function InsightVisual() {
  return (
    <VisualFrame>
      <span className="text-muted-foreground text-xs font-medium">
        Company Insight
      </span>
      <div className="mt-4 flex flex-col gap-3">
        <div className="border-border/50 rounded-lg border p-3">
          <span className="text-emerald-300/90 text-[10px] font-medium tracking-wide uppercase">
            Verified · public source
          </span>
          <p className="text-foreground/90 mt-1.5 text-xs leading-relaxed">
            Builds implantable brain-computer interfaces; publishes peer-reviewed
            work on neural decoding.
          </p>
        </div>
        <div className="border-border/50 border-dashed bg-card/40 rounded-lg border p-3">
          <span className="text-amber-300/90 text-[10px] font-medium tracking-wide uppercase">
            Inference · not confirmed
          </span>
          <p className="text-muted-foreground mt-1.5 text-xs leading-relaxed">
            Likely values low-latency embedded C++ given the real-time signal
            constraints described publicly.
          </p>
        </div>
      </div>
      <p className="text-muted-foreground/60 mt-4 text-[11px]">
        Facts and inference are always kept visibly separate.
      </p>
    </VisualFrame>
  );
}

function ProofVisual() {
  const items = [
    // Illustrative figures — this card is a labelled example workspace, not a
    // live profile. The units are the ledger's: verified is evidence-gated
    // (a passed competency check or a completed artefact), self-assessed is
    // kept separate and never counts toward it.
    { label: "Concepts verified", value: "63 / 81" },
    { label: "Artefacts built", value: "7" },
    { label: "Self-assessed only", value: "11" },
  ];
  return (
    <VisualFrame>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="bg-foreground/10 ring-border/60 flex size-9 items-center justify-center rounded-full font-medium ring-1">
            C
          </span>
          <div className="flex flex-col">
            <span className="text-sm font-medium">caleb</span>
            <span className="text-muted-foreground text-xs">
              provency.ai/u/caleb
            </span>
          </div>
        </div>
        <span className="border-border/60 text-muted-foreground shrink-0 rounded-full border px-2 py-0.5 text-xs">
          Example workspace
        </span>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-3">
        {items.map((it) => (
          <div key={it.label} className="flex flex-col">
            <span className="font-serif text-xl font-normal tracking-tight">
              {it.value}
            </span>
            <span className="text-muted-foreground/80 mt-1 text-[11px] leading-tight">
              {it.label}
            </span>
          </div>
        ))}
      </div>
      <div className="border-border/40 mt-5 flex flex-wrap gap-1.5 border-t pt-4">
        {["Signal processing", "Embedded C++", "Data pipelines"].map((tag) => (
          <span
            key={tag}
            className="border-border/60 text-muted-foreground rounded-full border px-2 py-0.5 text-[11px]"
          >
            {tag}
          </span>
        ))}
      </div>
      <p className="text-muted-foreground/60 mt-4 text-[11px]">
        Illustrative figures. On a real profile, verified means evidence — a
        passed check or a finished artefact — and self-assessed never counts
        toward it.
      </p>
    </VisualFrame>
  );
}

/* ───────────────────────────── How it works ─────────────────────────── */

const STEPS: { n: string; title: string; body: string }[] = [
  {
    n: "01",
    title: "Paste the job description",
    body: "Drop in the role you're aiming for. That's the only input — no long forms, no setup.",
  },
  {
    n: "02",
    title: "Get your personalized roadmap",
    body: "In a couple of minutes: skill clusters → sub-skills → concepts → real resources, sequenced from foundations to advanced.",
  },
  {
    n: "03",
    title: "Work through it & prove it",
    body: "Start at step one, verify what you understand, log artefacts, and render it all on a public profile.",
  },
];

function HowItWorks() {
  return (
    <section className="border-border/40 border-t px-6 py-24 sm:py-28">
      <div className="mx-auto max-w-5xl">
        <h2 className="font-serif max-w-xl text-4xl leading-[1.1] font-normal tracking-tight text-balance sm:text-5xl">
          From a job posting to a plan in three steps.
        </h2>
        <div className="mt-16 grid grid-cols-1 gap-x-12 gap-y-10 sm:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="border-border/40 flex flex-col border-t pt-5">
              <span className="text-muted-foreground/60 font-serif text-2xl tabular-nums">
                {s.n}
              </span>
              <h3 className="mt-3 text-lg font-medium tracking-tight">
                {s.title}
              </h3>
              <p className="text-muted-foreground mt-2 text-sm leading-relaxed text-pretty">
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────────── Founder note ─────────────────────────── */

function FounderNote() {
  return (
    <section className="px-6 py-24 sm:py-28">
      <figure className="mx-auto flex max-w-3xl flex-col items-center text-center">
        <blockquote className="font-serif text-2xl leading-snug font-normal text-balance sm:text-3xl">
          “I taught myself to code and kept hitting the same wall: I knew the job
          I wanted, but not the exact path to get there. Provency is the tool I
          wished I&apos;d had — paste the role, get an honest plan, and build
          proof you can actually do the work.”
        </blockquote>
        <figcaption className="text-muted-foreground mt-8 flex items-center gap-3 text-sm">
          <span className="bg-foreground/10 ring-border/60 flex size-9 items-center justify-center rounded-full font-medium ring-1">
            C
          </span>
          <span className="text-left">
            <span className="text-foreground font-medium">Caleb</span>
            <br />
            founder · self-taught engineer targeting medtech &amp; BCI roles
          </span>
        </figcaption>
      </figure>
    </section>
  );
}

/* ──────────────────── Social proof (honest placeholders) ─────────────── */

function Testimonials() {
  return (
    <section className="border-border/40 border-t px-6 py-24 sm:py-28">
      <div className="mx-auto max-w-5xl">
        <div className="max-w-2xl">
          <h2 className="font-serif text-3xl leading-[1.1] font-normal tracking-tight text-balance sm:text-4xl">
            Early days — and honest about it.
          </h2>
          <p className="text-muted-foreground mt-4 text-pretty">
            Provency is new. Rather than invent testimonials, these slots are
            reserved for real ones as people land roles.
          </p>
        </div>
        <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="border-border/50 flex flex-col gap-4 rounded-2xl border border-dashed p-6"
            >
              <p className="text-muted-foreground/60 text-sm italic leading-relaxed">
                “I went from a job description to an offer, and the roadmap was my
                map.”
              </p>
              <div className="mt-auto flex items-center gap-2.5">
                <span className="bg-muted/60 size-7 rounded-full" />
                <span className="bg-muted/60 h-3 w-24 rounded" />
              </div>
              <span className="text-muted-foreground/40 text-[10px] tracking-wide uppercase">
                Reserved for a real testimonial
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────── FAQ ─────────────────────────────────── */

const FAQS: { q: string; a: string }[] = [
  {
    q: "What do I actually paste in?",
    a: "The full text of a real job description — the role you're aiming for. That single input is enough; Provency reads what the role assesses and builds the roadmap from it.",
  },
  {
    q: "How long does it take to generate a roadmap?",
    a: "Usually a couple of minutes. You'll get a full hierarchy of skill clusters, sub-skills, concepts, and curated resources, sequenced from foundations to advanced.",
  },
  {
    q: "Where do the company facts come from?",
    a: "Company Insight only uses publicly available information, and it keeps verified facts strictly separate from clearly-labelled inference. It never invents an internal stack or private details.",
  },
  {
    q: "Is it free?",
    a: "Free to start, no credit card. You can build your first roadmap in about two minutes.",
  },
];

function Faq() {
  return (
    <section className="px-6 py-24 sm:py-28">
      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-x-16 gap-y-10 lg:grid-cols-[0.8fr_1.2fr]">
        <h2 className="font-serif text-3xl leading-[1.1] font-normal tracking-tight text-balance sm:text-4xl">
          Frequently asked questions
        </h2>
        <div className="flex flex-col">
          {FAQS.map((f) => (
            <details
              key={f.q}
              className="border-border/40 group border-b py-5 [&_summary::-webkit-details-marker]:hidden"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-medium">
                {f.q}
                <span className="text-muted-foreground transition-transform duration-200 group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="text-muted-foreground mt-3 text-sm leading-relaxed text-pretty">
                {f.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────── Final CTA ──────────────────────────── */

function FinalCta() {
  return (
    <section className="relative overflow-hidden px-6 py-28 sm:py-32">
      <div className="relative z-10 mx-auto flex max-w-2xl flex-col items-center text-center">
        <h2 className="font-serif text-4xl leading-[1.05] font-normal tracking-tight text-balance sm:text-6xl">
          Stop guessing where to start.
        </h2>
        <p className="text-muted-foreground mt-5 max-w-lg text-lg text-pretty">
          Paste the job you want and have a personalized roadmap in minutes. One
          step at a time, with proof at the end.
        </p>
        <div className="mt-9">
          <LandingCta size="xl" next="/syllabi" label="Build my roadmap" />
        </div>
        <p className="text-muted-foreground/70 mt-3 text-xs">
          Continue with Google · we only use it to create your account
        </p>
      </div>
      <FlowingGradient />
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-border/40 text-muted-foreground border-t px-6 py-10">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 text-xs sm:flex-row">
        <span className="bg-foreground text-background rounded-sm px-1.5 py-0.5 text-[10px] font-bold uppercase">
          Provency
        </span>
        <p>The personal learning OS for self-taught knowledge workers.</p>
        <div className="flex items-center gap-5">
          <Link href="/login" className="hover:text-foreground transition-colors">
            Log in
          </Link>
          <Link href="/signup" className="hover:text-foreground transition-colors">
            Sign up
          </Link>
        </div>
      </div>
    </footer>
  );
}
