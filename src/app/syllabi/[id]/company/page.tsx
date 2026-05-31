import { notFound } from "next/navigation";
import { connection } from "next/server";
import Link from "next/link";
import type { Metadata } from "next";
import { format } from "date-fns";
import {
  ArrowRight,
  Building2,
  Compass,
  ExternalLink,
  Info,
  Lightbulb,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { db } from "@/db";
import type { CompanyFactSourceType } from "@/db/schema";
import { requireCurrentUserId } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { PageContainer } from "@/components/page-container";
import { CompanyInsightButton } from "./company-insight-button";

type PageProps = { params: Promise<{ id: string }> };

const SOURCE_TYPE_LABEL: Record<CompanyFactSourceType, string> = {
  job_posting: "Job posting",
  eng_blog: "Eng blog",
  paper: "Paper",
  talk: "Talk",
  github: "GitHub",
  news: "News",
};

async function loadSyllabus(id: string, userId: string) {
  await connection();

  return db.query.syllabi.findFirst({
    where: (s, { and, eq }) => and(eq(s.id, id), eq(s.userId, userId)),
    columns: { id: true, targetRole: true, targetCompany: true },
  });
}

async function loadInsight(syllabusId: string) {
  return db.query.companyInsights.findFirst({
    where: (c, { eq }) => eq(c.syllabusId, syllabusId),
  });
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  const userId = await requireCurrentUserId();
  const syllabus = await loadSyllabus(id, userId);
  if (!syllabus) return { title: "Company insight not found — Provency" };
  return {
    title: `Company insight · ${syllabus.targetCompany ?? syllabus.targetRole} — Provency`,
  };
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Source link — always opens in a new tab, shows the host it points to. */
function SourceLink({ url, sourceType }: { url: string; sourceType?: CompanyFactSourceType }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {sourceType ? (
        <Badge
          variant="outline"
          className="border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-200"
        >
          {SOURCE_TYPE_LABEL[sourceType]}
        </Badge>
      ) : null}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-emerald-300/90 hover:text-emerald-200 inline-flex items-center gap-1 text-xs font-medium underline-offset-4 hover:underline"
      >
        {hostOf(url)}
        <ExternalLink className="size-3" />
      </a>
    </div>
  );
}

function Disclaimer() {
  return (
    <div className="border-border/60 bg-muted/30 text-muted-foreground flex items-start gap-2.5 rounded-lg border px-4 py-3 text-xs leading-relaxed">
      <Info className="mt-0.5 size-3.5 shrink-0" />
      <p>
        Company insights are drawn from public sources and informed inference.
        Verify specifics directly — internal practices aren&rsquo;t always
        public. Every &ldquo;verified&rdquo; item links to a real source that was
        retrieved at generation time; inferences are clearly marked and are not
        facts.
      </p>
    </div>
  );
}

export default async function CompanyInsightPage({ params }: PageProps) {
  const { id } = await params;
  const userId = await requireCurrentUserId();
  const syllabus = await loadSyllabus(id, userId);
  if (!syllabus) notFound();

  const company = syllabus.targetCompany?.trim() ?? "";
  const insight = await loadInsight(id);

  const backLink = (
    <div className="text-muted-foreground flex items-center gap-2 text-xs">
      <Link href={`/syllabi/${id}`} className="hover:text-foreground">
        ← Back to syllabus
      </Link>
      {insight ? (
        <>
          <span>·</span>
          <span>
            Generated {format(insight.generatedAt, "d MMM yyyy, HH:mm")}
          </span>
        </>
      ) : null}
    </div>
  );

  // ── No company on the syllabus ──────────────────────────────────────────────
  if (!company) {
    return (
      <PageContainer width="content" className="flex flex-col gap-8">
        <header className="flex flex-col gap-3">
          {backLink}
          <h1 className="text-3xl font-semibold tracking-tight">Company insight</h1>
        </header>
        <section className="border-amber-500/30 bg-amber-500/5 flex flex-col items-start gap-3 rounded-lg border px-6 py-8">
          <h2 className="text-amber-100 text-lg font-medium">
            No target company on this syllabus
          </h2>
          <p className="text-muted-foreground max-w-prose text-sm leading-relaxed">
            Company insight researches a specific company against public sources.
            This syllabus doesn&rsquo;t have a target company set, so there&rsquo;s
            nothing to research yet.
          </p>
        </section>
      </PageContainer>
    );
  }

  // ── Not generated yet ───────────────────────────────────────────────────────
  if (!insight) {
    return (
      <PageContainer width="content" className="flex flex-col gap-8">
        <header className="flex flex-col gap-3">
          {backLink}
          <h1 className="text-3xl font-semibold tracking-tight">
            Company insight
            <span className="text-muted-foreground font-normal"> · {company}</span>
          </h1>
        </header>
        <section className="border-border/60 bg-card flex flex-col items-start gap-4 rounded-lg border px-6 py-8">
          <div className="flex flex-col gap-2">
            <h2 className="flex items-center gap-2 text-lg font-medium">
              <Building2 className="size-4" /> Ground your roadmap in what&rsquo;s
              real
            </h2>
            <p className="text-muted-foreground max-w-prose text-sm leading-relaxed">
              We&rsquo;ll search {company}&rsquo;s public footprint — their job
              postings, engineering blog, papers and talks, GitHub, and reputable
              news — and report only what we can tie to a real source. No invented
              internal stack: anything not publicly documented is labelled as
              inference or left out.
            </p>
          </div>
          <CompanyInsightButton syllabusId={id} companyName={company} mode="generate" />
        </section>
        <Disclaimer />
      </PageContainer>
    );
  }

  const { verifiedFacts, techSignals, likelyInferences, alignmentNotes } = insight;
  const hasSourced = verifiedFacts.length > 0 || techSignals.length > 0;

  return (
    <PageContainer width="wide" className="flex flex-col gap-10">
      <header className="flex flex-col gap-4">
        {backLink}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <h1 className="text-3xl font-semibold tracking-tight">
            Company insight
            <span className="text-muted-foreground font-normal"> · {company}</span>
          </h1>
          <CompanyInsightButton
            syllabusId={id}
            companyName={company}
            mode="regenerate"
          />
        </div>
        <Disclaimer />
      </header>

      {/* 1 ── What we found (sourced) — the trustworthy core ───────────────────*/}
      <section className="flex flex-col gap-4">
        <SectionHeading
          icon={<ShieldCheck className="size-4 text-emerald-300" />}
          title="What we found"
          subtitle="Backed by a real public source — each links out so you can check it."
          count={verifiedFacts.length + techSignals.length}
        />

        {hasSourced ? (
          <div className="grid grid-cols-1 gap-x-8 gap-y-8 lg:grid-cols-2 lg:items-start">
            {/* Verified facts */}
            <div className="flex flex-col gap-2">
              <h3 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                Verified facts
              </h3>
              {verifiedFacts.length > 0 ? (
                <ul className="flex flex-col gap-2">
                  {verifiedFacts.map((f, i) => (
                    <li
                      key={i}
                      className="border-emerald-500/25 bg-emerald-500/[0.06] flex flex-col gap-2 rounded-lg border px-4 py-3"
                    >
                      <span className="text-emerald-50 text-sm leading-relaxed">
                        {f.claim}
                      </span>
                      <SourceLink url={f.sourceUrl} sourceType={f.sourceType} />
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyNote>No standalone facts were verifiable from public sources.</EmptyNote>
              )}
            </div>

            {/* Tech signals */}
            <div className="flex flex-col gap-2">
              <h3 className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Wrench className="size-3.5" /> Tech signals
              </h3>
              <p className="text-muted-foreground text-xs leading-relaxed">
                Languages, tools, and frameworks {company} demonstrably hires for
                or uses publicly.
              </p>
              {techSignals.length > 0 ? (
                <ul className="flex flex-col gap-2">
                  {techSignals.map((t, i) => (
                    <li
                      key={i}
                      className="border-emerald-500/25 bg-emerald-500/[0.06] flex flex-col gap-1.5 rounded-lg border px-4 py-3"
                    >
                      <span className="text-emerald-50 text-sm font-medium">
                        {t.item}
                      </span>
                      <span className="text-muted-foreground text-sm leading-relaxed">
                        {t.evidence}
                      </span>
                      {t.sourceUrl ? <SourceLink url={t.sourceUrl} /> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyNote>No tech signals were verifiable from public sources.</EmptyNote>
              )}
            </div>
          </div>
        ) : (
          // Honest empty-ish state — no fabricated detail.
          <div className="border-border/60 bg-card flex flex-col gap-2 rounded-lg border px-6 py-8">
            <p className="text-foreground/90 text-sm leading-relaxed">
              We found limited public information about {company}&rsquo;s internal
              practices — here&rsquo;s what&rsquo;s verifiable: nothing concrete
              could be tied to a public source this time.
            </p>
            <p className="text-muted-foreground text-sm leading-relaxed">
              That&rsquo;s an honest result, not a failure — many companies keep
              their stack private. Try regenerating, or check the inferences below
              (clearly marked as informed guesses). We&rsquo;d rather show you a
              thin honest picture than invent details.
            </p>
          </div>
        )}
      </section>

      {/* 2 ── Reasonable inferences — clearly NOT facts ────────────────────────*/}
      {likelyInferences.length > 0 ? (
        <section className="flex flex-col gap-4">
          <SectionHeading
            icon={<Lightbulb className="size-4 text-amber-300" />}
            title="Reasonable inferences"
            subtitle="Informed guesses reasoned from public facts — not verified, not stated as certain."
            count={likelyInferences.length}
          />
          <ul className="flex flex-col gap-2">
            {likelyInferences.map((inf, i) => (
              <li
                key={i}
                className="border-amber-500/30 border-dashed bg-amber-500/[0.05] flex flex-col gap-1.5 rounded-lg border px-4 py-3"
              >
                <div className="flex items-start gap-2">
                  <Badge
                    variant="outline"
                    className="border-amber-500/40 bg-amber-500/10 mt-0.5 text-[10px] text-amber-100"
                  >
                    Inference
                  </Badge>
                  <span className="text-amber-50 text-sm leading-relaxed">
                    {inf.inference}
                  </span>
                </div>
                <span className="text-muted-foreground text-xs leading-relaxed">
                  <span className="font-medium">Based on:</span> {inf.basedOn}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* 3 ── How this sharpens your roadmap ───────────────────────────────────*/}
      {alignmentNotes.length > 0 ? (
        <section className="flex flex-col gap-4">
          <SectionHeading
            icon={<Compass className="size-4 text-sky-300" />}
            title="How this sharpens your roadmap"
            subtitle="Advisory only — we don't auto-edit your syllabus from these yet."
            count={alignmentNotes.length}
          />
          <ul className="flex flex-col gap-2">
            {alignmentNotes.map((note, i) => (
              <li
                key={i}
                className="border-sky-500/25 bg-sky-500/[0.06] flex flex-col gap-1.5 rounded-lg border px-4 py-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <ArrowRight className="size-3.5 shrink-0 text-sky-300" />
                  <span className="text-sky-100 text-xs font-medium">
                    {note.affectedClusterOrConcept}
                  </span>
                </div>
                <span className="text-foreground/85 text-sm leading-relaxed">
                  {note.note}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <footer className="text-muted-foreground border-border/60 border-t pt-6 text-xs">
        Generated by {insight.model} ·{" "}
        {format(insight.generatedAt, "d MMM yyyy, HH:mm")}. Sourced facts link to
        pages retrieved at generation time. Re-generate any time — public
        information changes.
      </footer>
    </PageContainer>
  );
}

function SectionHeading({
  icon,
  title,
  subtitle,
  count,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  count?: number;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-lg font-medium tracking-tight">{title}</h2>
        {typeof count === "number" ? (
          <span className="text-muted-foreground text-sm">({count})</span>
        ) : null}
      </div>
      <p className="text-muted-foreground text-sm">{subtitle}</p>
    </div>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="border-border/40 text-muted-foreground rounded-lg border border-dashed px-4 py-3 text-sm">
      {children}
    </p>
  );
}
