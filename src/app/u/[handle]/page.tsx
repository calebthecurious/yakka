import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { Metadata } from "next";
import { format } from "date-fns";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  Award,
  BadgeCheck,
  BookOpen,
  ExternalLink,
  FileText,
  GitPullRequest,
  Globe,
  Hammer,
  ScrollText,
  Sprout,
  Video,
  type LucideIcon,
} from "lucide-react";
import { db } from "@/db";
import {
  artefacts,
  competencyChecks,
  concepts,
  gapReports,
  profiles,
  resources,
  skillClusters,
  subSkills,
  syllabi,
} from "@/db/schema";
import { cn } from "@/lib/utils";
import {
  computeReadinessLedger,
  criteriaProgress,
  formatEvidenceLabel,
  isArtefactBacked,
  isConceptInProgress,
  isSelfDeclaredDone,
  type ArtefactType,
  type ConceptStatus,
  type ReadinessInput,
  type ResourceStatus,
  type ResourceType,
} from "@/lib/readiness/model";

export const revalidate = 60;

type PageProps = { params: Promise<{ handle: string }> };

type ArtefactTypeT = "project" | "writeup" | "certificate" | "contribution";
type ResourceTypeT =
  | "course"
  | "book"
  | "video"
  | "article"
  | "project"
  | "paper";

const ARTEFACT_META: Record<ArtefactTypeT, { label: string; icon: LucideIcon }> =
  {
    project: { label: "Project", icon: Hammer },
    writeup: { label: "Writeup", icon: ScrollText },
    certificate: { label: "Certificate", icon: Award },
    contribution: { label: "Contribution", icon: GitPullRequest },
  };

const RESOURCE_META: Record<ResourceTypeT, { label: string; icon: LucideIcon }> =
  {
    course: { label: "Courses", icon: BookOpen },
    book: { label: "Books", icon: BookOpen },
    video: { label: "Videos", icon: Video },
    article: { label: "Articles", icon: FileText },
    project: { label: "Projects", icon: Hammer },
    paper: { label: "Papers", icon: ScrollText },
  };

type EvidenceLabel = string;

type VerifiedConcept = {
  id: string;
  name: string;
  evidence: EvidenceLabel[];
};

type ClusterGroup = { clusterName: string; concepts: VerifiedConcept[] };
type SelfAssessedGroup = { clusterName: string; conceptNames: string[] };

type ProfileArtefact = {
  id: string;
  type: ArtefactTypeT;
  title: string;
  description: string;
  url: string | null;
  evidenceUrl: string | null;
  completed: boolean;
  criteriaTotal: number;
  criteriaDone: number;
  demonstrates: string[];
  /** Why an employer values this artefact, from its cluster's artefactTarget. */
  employerValue: string | null;
};

type TrailType = { type: ResourceTypeT; count: number };
type TrailNamed = { title: string; author: string | null; type: ResourceTypeT };

type Developing = { label: string; note: string };

type LoadedProfile = {
  publicProfile: {
    displayName: string;
    handle: string;
    headline: string | null;
    githubUrl: string | null;
    linkedinUrl: string | null;
    websiteUrl: string | null;
    showLearningTrail: boolean;
    showSelfAssessed: boolean;
    showCurrentlyDeveloping: boolean;
  };
  syllabus: { targetRole: string; targetCompany: string | null; createdAt: Date } | null;
  readiness: {
    verified: number;
    inProgress: number;
    projectsCompleted: number;
    /** Artefacts with `verifiedAt` set — a pasted URL is not a completion. */
    artefactsCompleted: number;
  };
  artefactList: ProfileArtefact[];
  verifiedGroups: ClusterGroup[];
  selfAssessedGroups: SelfAssessedGroup[];
  trail: { byType: TrailType[]; total: number; named: TrailNamed[] };
  developing: Developing[];
};

async function loadProfile(handle: string): Promise<LoadedProfile | null> {
  await connection();

  // Only public-safe profile columns. (The whole row is publicly readable, but
  // selecting explicitly keeps the public surface obvious and auditable.)
  const [profileRow] = await db
    .select({
      id: profiles.id,
      displayName: profiles.displayName,
      handle: profiles.handle,
      headline: profiles.headline,
      githubUrl: profiles.githubUrl,
      linkedinUrl: profiles.linkedinUrl,
      websiteUrl: profiles.websiteUrl,
      showLearningTrail: profiles.showLearningTrail,
      showSelfAssessed: profiles.showSelfAssessed,
      showCurrentlyDeveloping: profiles.showCurrentlyDeveloping,
    })
    .from(profiles)
    .where(eq(profiles.handle, handle))
    .limit(1);

  if (!profileRow || !profileRow.handle) return null;

  const publicProfile = {
    displayName: profileRow.displayName,
    handle: profileRow.handle,
    headline: profileRow.headline,
    githubUrl: profileRow.githubUrl,
    linkedinUrl: profileRow.linkedinUrl,
    websiteUrl: profileRow.websiteUrl,
    showLearningTrail: profileRow.showLearningTrail,
    showSelfAssessed: profileRow.showSelfAssessed,
    showCurrentlyDeveloping: profileRow.showCurrentlyDeveloping,
  };

  const empty: LoadedProfile = {
    publicProfile,
    syllabus: null,
    readiness: { verified: 0, inProgress: 0, projectsCompleted: 0, artefactsCompleted: 0 },
    artefactList: [],
    verifiedGroups: [],
    selfAssessedGroups: [],
    trail: { byType: [], total: 0, named: [] },
    developing: [],
  };

  // The ONE featured syllabus. If the user hasn't chosen one yet, fall back to
  // their most recent so the page still renders. Never read any other syllabus.
  const [featured] = await db
    .select()
    .from(syllabi)
    .where(and(eq(syllabi.userId, profileRow.id), eq(syllabi.isFeaturedOnProfile, true)))
    .limit(1);

  let syllabus = featured;
  if (!syllabus) {
    [syllabus] = await db
      .select()
      .from(syllabi)
      .where(eq(syllabi.userId, profileRow.id))
      .orderBy(desc(syllabi.createdAt))
      .limit(1);
  }
  if (!syllabus) return empty;

  const clusterRows = await db
    .select({
      id: skillClusters.id,
      name: skillClusters.name,
      orderIndex: skillClusters.orderIndex,
      artefactTarget: skillClusters.artefactTarget,
      weight: skillClusters.weight,
      isArtefactBearing: skillClusters.isArtefactBearing,
    })
    .from(skillClusters)
    .where(eq(skillClusters.syllabusId, syllabus.id))
    .orderBy(skillClusters.orderIndex);

  const clusterIds = clusterRows.map((c) => c.id);
  const clusterName = new Map(clusterRows.map((c) => [c.id, c.name]));
  // clusterId → the artefact's employer-value framing (null if none).
  const clusterEmployerValue = new Map(
    clusterRows.map((c) => [c.id, c.artefactTarget?.employerValue ?? null]),
  );

  const subSkillRows = clusterIds.length
    ? await db
        .select({ id: subSkills.id, clusterId: subSkills.clusterId })
        .from(subSkills)
        .where(inArray(subSkills.clusterId, clusterIds))
    : [];

  const subSkillIds = subSkillRows.map((s) => s.id);
  const subSkillToCluster = new Map(subSkillRows.map((s) => [s.id, s.clusterId]));

  const conceptRows = subSkillIds.length
    ? await db
        .select({
          id: concepts.id,
          name: concepts.name,
          status: concepts.status,
          subSkillId: concepts.subSkillId,
        })
        .from(concepts)
        .where(inArray(concepts.subSkillId, subSkillIds))
    : [];

  const conceptIds = conceptRows.map((c) => c.id);

  // Competency checks — raw rows for the ledger; scoring lives in the module.
  const checkRows = conceptIds.length
    ? await db
        .select({
          conceptId: competencyChecks.conceptId,
          score: competencyChecks.score,
          completedAt: competencyChecks.completedAt,
        })
        .from(competencyChecks)
        .where(inArray(competencyChecks.conceptId, conceptIds))
    : [];

  // Artefacts (public-safe columns only — no reflection, no progress log).
  const artefactRows = subSkillIds.length
    ? await db
        .select({
          id: artefacts.id,
          type: artefacts.type,
          title: artefacts.title,
          description: artefacts.description,
          url: artefacts.url,
          evidenceUrl: artefacts.evidenceUrl,
          acceptanceCriteria: artefacts.acceptanceCriteria,
          demonstratedConceptIds: artefacts.demonstratedConceptIds,
          verifiedAt: artefacts.verifiedAt,
          subSkillId: artefacts.subSkillId,
          createdAt: artefacts.createdAt,
        })
        .from(artefacts)
        .where(inArray(artefacts.subSkillId, subSkillIds))
    : [];

  const conceptName = new Map(conceptRows.map((c) => [c.id, c.name]));

  // Learning-trail rows. Titles/authors are public works; notes are NEVER
  // selected (and are absent from the ledger's input shape by design).
  const resourceRows = conceptIds.length
    ? await db
        .select({
          conceptId: resources.conceptId,
          type: resources.type,
          title: resources.title,
          author: resources.author,
          status: resources.status,
        })
        .from(resources)
        .where(inArray(resources.conceptId, conceptIds))
    : [];

  // ── The ledger is the only computation. Every number, label, and partition
  // below is read from it; this route only maps ids to display names. ──
  const input: ReadinessInput = {
    clusters: clusterRows.map((c) => ({
      id: c.id,
      weight: c.weight,
      isArtefactBearing: c.isArtefactBearing,
    })),
    concepts: conceptRows.map((c) => ({
      id: c.id,
      clusterId: subSkillToCluster.get(c.subSkillId) ?? "",
      subSkillId: c.subSkillId,
      status: c.status as ConceptStatus,
    })),
    competencyChecks: checkRows,
    artefacts: artefactRows.map((a) => ({
      id: a.id,
      clusterId: subSkillToCluster.get(a.subSkillId) ?? "",
      verifiedAt: a.verifiedAt,
      demonstratedConceptIds: a.demonstratedConceptIds,
      title: a.title,
      type: a.type as ArtefactType,
      acceptanceCriteria: a.acceptanceCriteria,
    })),
    foundationItems: [],
    resources: resourceRows.map((r) => ({
      conceptId: r.conceptId,
      type: r.type as ResourceType,
      status: r.status as ResourceStatus,
      title: r.title,
      author: r.author,
    })),
  };
  const ledger = computeReadinessLedger(input);

  // Verified competencies with provenance, straight from the ledger. A concept
  // still marked "learning" whose check passed IS listed — evidence is never
  // hidden behind self-declaration (the P1.5b disposition).
  const verifiedByCluster = new Map<string, VerifiedConcept[]>();
  for (const e of ledger.evidence) {
    const name = conceptName.get(e.conceptId);
    if (!name) continue;
    const cname = clusterName.get(e.clusterId) ?? "Other";
    const list = verifiedByCluster.get(cname) ?? [];
    list.push({
      id: e.conceptId,
      name,
      evidence: e.evidence.map(formatEvidenceLabel),
    });
    verifiedByCluster.set(cname, list);
  }

  // Self-assessed: self-declared done, minus everything the ledger verified —
  // the same named rule and the same verdict behind ledger.selfAssessed.concepts.
  const verifiedIds = new Set(
    ledger.conceptStates.filter((c) => c.verified).map((c) => c.conceptId),
  );
  const selfByCluster = new Map<string, string[]>();
  for (const c of conceptRows) {
    if (!isSelfDeclaredDone(c.status as ConceptStatus)) continue;
    if (verifiedIds.has(c.id)) continue;
    const cid = subSkillToCluster.get(c.subSkillId);
    const cname = cid ? (clusterName.get(cid) ?? "Other") : "Other";
    const list = selfByCluster.get(cname) ?? [];
    list.push(c.name);
    selfByCluster.set(cname, list);
  }

  // Preserve cluster order from the syllabus.
  const orderedClusterNames = clusterRows.map((c) => c.name);
  const verifiedGroups: ClusterGroup[] = orderedClusterNames
    .map((name) => ({ clusterName: name, concepts: verifiedByCluster.get(name) ?? [] }))
    .filter((g) => g.concepts.length > 0);
  const selfAssessedGroups: SelfAssessedGroup[] = orderedClusterNames
    .map((name) => ({ clusterName: name, conceptNames: selfByCluster.get(name) ?? [] }))
    .filter((g) => g.conceptNames.length > 0);

  // Artefacts list: completed first, then most recent. Lead signal. Sort the
  // raw rows (which carry the timestamps) before projecting to the public shape.
  const sortedArtefacts = [...artefactRows].sort((a, b) => {
    const aDone = isArtefactBacked(a.verifiedAt);
    const bDone = isArtefactBacked(b.verifiedAt);
    if (aDone !== bDone) return aDone ? -1 : 1;
    const at = (a.verifiedAt ?? a.createdAt).getTime();
    const bt = (b.verifiedAt ?? b.createdAt).getTime();
    return bt - at;
  });
  const artefactList: ProfileArtefact[] = sortedArtefacts.map((a) => {
    const criteria = criteriaProgress(a.acceptanceCriteria);
    return {
      id: a.id,
      type: a.type as ArtefactTypeT,
      title: a.title,
      description: a.description,
      url: a.url,
      evidenceUrl: a.evidenceUrl,
      completed: isArtefactBacked(a.verifiedAt),
      criteriaTotal: criteria.total,
      criteriaDone: criteria.done,
      demonstrates: a.demonstratedConceptIds
        .map((id) => conceptName.get(id))
        .filter((n): n is string => Boolean(n)),
      employerValue:
        clusterEmployerValue.get(subSkillToCluster.get(a.subSkillId) ?? "") ?? null,
    };
  });

  // Learning trail — the ledger's inventory of completed resources.
  const trailByType: TrailType[] = ledger.trail.byType.map((t) => ({
    type: t.type as ResourceTypeT,
    count: t.count,
  }));
  const trailNamed: TrailNamed[] = [];
  for (const r of ledger.trail.named) {
    if (r.title == null) continue;
    trailNamed.push({ title: r.title, author: r.author, type: r.type as ResourceTypeT });
  }

  // Currently developing — prefer the gap report's in-progress framing; else
  // fall back to in-progress concepts. Honest, positive.
  const [gap] = await db
    .select({ gapsInProgress: gapReports.gapsInProgress })
    .from(gapReports)
    .where(eq(gapReports.syllabusId, syllabus.id))
    .limit(1);

  let developing: Developing[] = [];
  if (gap && gap.gapsInProgress.length > 0) {
    developing = gap.gapsInProgress
      .slice(0, 6)
      .map((g) => ({ label: g.requirement, note: g.note }));
  } else {
    developing = conceptRows
      .filter((c) => isConceptInProgress(c.status as ConceptStatus))
      .slice(0, 6)
      .map((c) => {
        const cid = subSkillToCluster.get(c.subSkillId);
        return { label: c.name, note: cid ? (clusterName.get(cid) ?? "") : "" };
      });
  }

  return {
    publicProfile,
    syllabus: {
      targetRole: syllabus.targetRole,
      targetCompany: syllabus.targetCompany,
      createdAt: syllabus.createdAt,
    },
    readiness: {
      verified: ledger.breakdown.conceptsVerified,
      inProgress: ledger.activity.conceptsInProgress,
      projectsCompleted: ledger.artefacts.projectsCompleted,
      artefactsCompleted: ledger.artefacts.completed,
    },
    artefactList,
    verifiedGroups,
    selfAssessedGroups,
    trail: { byType: trailByType, total: ledger.trail.total, named: trailNamed },
    developing,
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { handle } = await params;
  const profile = await loadProfile(handle);
  if (!profile) return { title: "Not found" };
  const name = profile.publicProfile.displayName;
  if (!profile.syllabus) return { title: `${name} — Provency` };
  return {
    title: `${name} → ${profile.syllabus.targetRole} — Provency`,
    description:
      profile.publicProfile.headline ??
      `${name}'s role-readiness profile for ${profile.syllabus.targetRole}.`,
  };
}

export default async function PublicProfilePage({ params }: PageProps) {
  const { handle } = await params;
  const profile = await loadProfile(handle);
  if (!profile) notFound();

  const {
    publicProfile: p,
    syllabus,
    readiness,
    artefactList,
    verifiedGroups,
    selfAssessedGroups,
    trail,
    developing,
  } = profile;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-16 px-5 py-14 sm:px-6 sm:py-20">
      {/* 1. Header */}
      <header className="flex flex-col gap-5">
        <div className="flex flex-col gap-3">
          <h1 className="font-serif text-4xl font-normal tracking-tight sm:text-5xl">
            {p.displayName}
          </h1>
          {p.headline ? (
            <p className="text-foreground/80 max-w-2xl text-lg text-pretty">
              {p.headline}
            </p>
          ) : null}
        </div>

        {syllabus ? (
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className="text-muted-foreground/70">Working toward</span>
            <span className="text-foreground font-medium">
              {syllabus.targetRole}
            </span>
            {syllabus.targetCompany ? (
              <span>· {syllabus.targetCompany}</span>
            ) : null}
            <span className="text-muted-foreground/50">
              · since {format(syllabus.createdAt, "MMM yyyy")}
            </span>
          </div>
        ) : null}

        <ExternalLinks
          github={p.githubUrl}
          linkedin={p.linkedinUrl}
          website={p.websiteUrl}
        />
      </header>

      {!syllabus ? (
        <p className="text-muted-foreground text-sm">
          No syllabus featured yet.
        </p>
      ) : (
        <>
          {/* 2. Readiness snapshot — honest counts, no fabricated % */}
          <section className="flex flex-col gap-4">
            <SectionLabel>Readiness snapshot</SectionLabel>
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-border sm:grid-cols-4">
              <Stat value={readiness.verified} label="Verified competencies" />
              <Stat value={readiness.inProgress} label="In progress" />
              <Stat value={readiness.projectsCompleted} label="Projects completed" />
              <Stat value={readiness.artefactsCompleted} label="Artefacts completed" />
            </div>
            <p className="text-muted-foreground/70 text-xs">
              Counts, not a score. &ldquo;Verified&rdquo; means backed by a passed
              competency check or demonstrated in a completed artefact — not
              self-marked.
            </p>
          </section>

          {/* 3. Artefacts & projects — strongest signal, leads */}
          <section className="flex flex-col gap-5">
            <div className="flex flex-col gap-1">
              <SectionTitle>Artefacts &amp; projects</SectionTitle>
              <p className="text-muted-foreground text-sm">
                The work itself — built, shipped, and linked. The clearest proof
                of what they can do.
              </p>
            </div>
            {artefactList.length === 0 ? (
              <EmptyNote>
                No artefacts published yet. Projects, writeups, and contributions
                appear here as they&apos;re built.
              </EmptyNote>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {artefactList.map((a) => (
                  <ArtefactCard key={a.id} artefact={a} />
                ))}
              </div>
            )}
          </section>

          {/* 4. Verified competencies — evidence-backed */}
          <section className="flex flex-col gap-5">
            <div className="flex flex-col gap-1">
              <SectionTitle>
                <BadgeCheck
                  className="inline size-5 text-emerald-300 align-[-3px]"
                  aria-hidden
                />{" "}
                Verified competencies
              </SectionTitle>
              <p className="text-muted-foreground text-sm">
                Each one is backed by a passed competency check or demonstrated in
                a completed artefact.
              </p>
            </div>
            {verifiedGroups.length === 0 ? (
              <EmptyNote>
                Nothing verified yet. Competencies move here once they&apos;re
                proven by a passed check or a completed project.
              </EmptyNote>
            ) : (
              <div className="flex flex-col gap-6">
                {verifiedGroups.map((g) => (
                  <div key={g.clusterName} className="flex flex-col gap-3">
                    <h3 className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
                      {g.clusterName}
                    </h3>
                    <ul className="flex flex-col gap-2.5">
                      {g.concepts.map((c) => (
                        <li
                          key={c.id}
                          className="border-border/60 bg-card/40 flex flex-col gap-1.5 rounded-lg border px-4 py-3"
                        >
                          <div className="flex items-center gap-2">
                            <BadgeCheck
                              className="size-4 shrink-0 text-emerald-300"
                              aria-hidden
                            />
                            <span className="text-sm font-medium">{c.name}</span>
                          </div>
                          <ul className="ml-6 flex flex-col gap-0.5">
                            {c.evidence.map((e) => (
                              <li
                                key={e}
                                className="text-muted-foreground text-xs"
                              >
                                {e}
                              </li>
                            ))}
                          </ul>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 5. Self-assessed — clearly labelled, lower weight */}
          {p.showSelfAssessed && selfAssessedGroups.length > 0 ? (
            <section className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <SectionTitle muted>Self-assessed understanding</SectionTitle>
                <p className="text-muted-foreground text-sm">
                  Marked understood by {p.displayName.split(" ")[0]}, but not yet
                  backed by a competency check or project. Shown honestly,
                  separate from verified work.
                </p>
              </div>
              <div className="flex flex-col gap-5">
                {selfAssessedGroups.map((g) => (
                  <div key={g.clusterName} className="flex flex-col gap-2">
                    <h3 className="text-muted-foreground/70 text-xs font-medium tracking-wider uppercase">
                      {g.clusterName}
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {g.conceptNames.map((name) => (
                        <span
                          key={name}
                          className="border-border/50 text-muted-foreground rounded-full border border-dashed px-2.5 py-1 text-xs"
                        >
                          {name}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {/* 6. Learning trail */}
          {p.showLearningTrail && trail.total > 0 ? (
            <section className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <SectionTitle>Learning trail</SectionTitle>
                <p className="text-muted-foreground text-sm">
                  How the work was done — {trail.total} resource
                  {trail.total === 1 ? "" : "s"} worked through.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {trail.byType.map((t) => {
                  const meta = RESOURCE_META[t.type];
                  const Icon = meta.icon;
                  return (
                    <span
                      key={t.type}
                      className="border-border/60 bg-card/40 text-muted-foreground flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs"
                    >
                      <Icon className="size-3.5" aria-hidden />
                      <span className="text-foreground font-medium tabular-nums">
                        {t.count}
                      </span>
                      {meta.label}
                    </span>
                  );
                })}
              </div>
              {trail.named.length > 0 ? (
                <ul className="mt-1 flex flex-col gap-1.5">
                  {trail.named.map((r) => (
                    <li
                      key={`${r.title}-${r.author ?? ""}`}
                      className="text-muted-foreground flex items-baseline gap-2 text-sm"
                    >
                      <span className="bg-foreground/30 mt-1.5 size-1 shrink-0 rounded-full" />
                      <span>
                        <span className="text-foreground/90">{r.title}</span>
                        {r.author ? (
                          <span className="text-muted-foreground/70">
                            {" "}
                            · {r.author}
                          </span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}

          {/* 7. Currently developing */}
          {p.showCurrentlyDeveloping && developing.length > 0 ? (
            <section className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <SectionTitle>
                  <Sprout
                    className="inline size-4 text-sky-300 align-[-2px]"
                    aria-hidden
                  />{" "}
                  Currently developing
                </SectionTitle>
                <p className="text-muted-foreground text-sm">
                  Honest about what&apos;s still in progress.
                </p>
              </div>
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {developing.map((d) => (
                  <li
                    key={d.label}
                    className="border-border/50 flex flex-col gap-0.5 rounded-lg border px-4 py-3"
                  >
                    <span className="text-sm font-medium">{d.label}</span>
                    {d.note ? (
                      <span className="text-muted-foreground text-xs">
                        {d.note}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}

      <footer className="border-border/50 text-muted-foreground/70 flex items-center justify-between border-t pt-6 text-xs">
        <span>provency.ai · role-readiness profile</span>
        <span>Updated {format(new Date(), "d MMM yyyy")}</span>
      </footer>
    </main>
  );
}

/* ───────────────────────────── components ───────────────────────────── */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
      {children}
    </h2>
  );
}

function SectionTitle({
  children,
  muted = false,
}: {
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <h2
      className={cn(
        "text-xl font-semibold tracking-tight sm:text-2xl",
        muted && "text-foreground/70",
      )}
    >
      {children}
    </h2>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-border/60 bg-card/20 rounded-lg border border-dashed px-5 py-8 text-center">
      <p className="text-muted-foreground text-sm text-balance">{children}</p>
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="bg-background flex flex-col gap-1 px-4 py-5">
      <span className="font-serif text-3xl font-normal tabular-nums sm:text-4xl">
        {value}
      </span>
      <span className="text-muted-foreground text-xs leading-tight text-pretty">
        {label}
      </span>
    </div>
  );
}

function ArtefactCard({ artefact: a }: { artefact: ProfileArtefact }) {
  const meta = ARTEFACT_META[a.type];
  const Icon = meta.icon;
  return (
    <article className="border-border/60 bg-card/40 flex flex-col gap-3 rounded-xl border p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="bg-background/60 ring-border/60 flex size-9 items-center justify-center rounded-lg ring-1">
            <Icon className="text-muted-foreground size-4" aria-hidden />
          </span>
          <div className="flex flex-col">
            <span className="text-muted-foreground text-[10px] tracking-wide uppercase">
              {meta.label}
            </span>
            <h3 className="font-medium tracking-tight">{a.title}</h3>
          </div>
        </div>
        {a.completed ? (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-400/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
            <BadgeCheck className="size-3" aria-hidden />
            Completed
          </span>
        ) : (
          <span className="text-muted-foreground/70 shrink-0 rounded-full border border-border/50 px-2 py-0.5 text-[11px]">
            In progress
          </span>
        )}
      </div>

      {a.description ? (
        <p className="text-foreground/85 text-sm leading-relaxed">
          {a.description}
        </p>
      ) : null}

      {a.employerValue ? (
        <p className="border-foreground/10 text-foreground/75 border-l-2 pl-3 text-xs leading-relaxed">
          <span className="text-muted-foreground/70 font-medium">
            Why an employer values this:{" "}
          </span>
          {a.employerValue}
        </p>
      ) : null}

      {a.demonstrates.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-muted-foreground/70 text-[11px] tracking-wide uppercase">
            Demonstrates
          </span>
          <div className="flex flex-wrap gap-1.5">
            {a.demonstrates.map((name) => (
              <span
                key={name}
                className="border-border/60 bg-background/40 rounded-full border px-2.5 py-0.5 text-xs"
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {a.url ? (
          <a
            href={a.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
          >
            View work
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        ) : null}
        {a.evidenceUrl ? (
          <a
            href={a.evidenceUrl}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground flex items-center gap-1 text-sm underline-offset-4 hover:underline"
          >
            Evidence
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        ) : null}
        {a.criteriaTotal > 0 ? (
          <span className="text-muted-foreground text-xs tabular-nums">
            {a.criteriaDone}/{a.criteriaTotal} acceptance criteria met
          </span>
        ) : null}
      </div>
    </article>
  );
}

function ExternalLinks({
  github,
  linkedin,
  website,
}: {
  github: string | null;
  linkedin: string | null;
  website: string | null;
}) {
  if (!github && !linkedin && !website) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {github ? (
        <LinkChip href={github} label="GitHub">
          <GithubMark />
        </LinkChip>
      ) : null}
      {linkedin ? (
        <LinkChip href={linkedin} label="LinkedIn">
          <LinkedinMark />
        </LinkChip>
      ) : null}
      {website ? (
        <LinkChip href={website} label="Website">
          <Globe className="size-3.5" aria-hidden />
        </LinkChip>
      ) : null}
    </div>
  );
}

function LinkChip({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="border-border/60 bg-card/40 text-muted-foreground hover:text-foreground hover:border-foreground/20 flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors"
    >
      {children}
      {label}
    </a>
  );
}

/* Brand marks (Simple Icons paths) — inline so there's no icon-font dependency. */
function GithubMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor" aria-hidden>
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

function LinkedinMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor" aria-hidden>
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z" />
    </svg>
  );
}
