import { notFound } from "next/navigation";
import { connection } from "next/server";
import Link from "next/link";
import type { Metadata } from "next";
import { format, formatDistanceToNow } from "date-fns";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import {
  Award,
  ExternalLink,
  GitPullRequest,
  Hammer,
  ScrollText,
  type LucideIcon,
} from "lucide-react";
import { db } from "@/db";
import {
  artefacts,
  concepts,
  profiles,
  skillClusters,
  subSkills,
  syllabi,
} from "@/db/schema";

export const revalidate = 60;

type PageProps = { params: Promise<{ handle: string }> };

type ClusterType = "technical" | "domain" | "soft" | "meta";
type Status = "not_started" | "learning" | "understood" | "verified";
type ArtefactType = "project" | "writeup" | "certificate" | "contribution";

const ARTEFACT_META: Record<
  ArtefactType,
  { label: string; icon: LucideIcon }
> = {
  project: { label: "Project", icon: Hammer },
  writeup: { label: "Writeup", icon: ScrollText },
  certificate: { label: "Certificate", icon: Award },
  contribution: { label: "Contribution", icon: GitPullRequest },
};

const CLUSTER_TYPE_STYLE: Record<ClusterType, { label: string; dot: string }> =
  {
    technical: { label: "Technical", dot: "bg-foreground/60" },
    domain: { label: "Domain", dot: "bg-amber-400/80" },
    soft: { label: "Soft", dot: "bg-sky-400/80" },
    meta: { label: "Meta", dot: "bg-emerald-400/80" },
  };

async function loadProfile(handle: string) {
  await connection();

  const [profileRow] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.handle, handle))
    .limit(1);

  if (!profileRow) return null;

  const [currentSyllabus] = await db
    .select()
    .from(syllabi)
    .where(eq(syllabi.userId, profileRow.id))
    .orderBy(desc(syllabi.createdAt))
    .limit(1);

  if (!currentSyllabus) {
    return {
      publicProfile: profileRow,
      syllabus: null,
      clusters: [],
      totals: { total: 0, understood: 0, verified: 0 },
      recentUnderstood: [],
      verifiedArtefacts: [],
    };
  }

  const clusterRows = await db
    .select()
    .from(skillClusters)
    .where(eq(skillClusters.syllabusId, currentSyllabus.id))
    .orderBy(skillClusters.orderIndex);

  const clusterIds = clusterRows.map((c) => c.id);
  if (clusterIds.length === 0) {
    return {
      publicProfile: profileRow,
      syllabus: currentSyllabus,
      clusters: [],
      totals: { total: 0, understood: 0, verified: 0 },
      recentUnderstood: [],
      verifiedArtefacts: [],
    };
  }

  const subSkillRows = await db
    .select()
    .from(subSkills)
    .where(inArray(subSkills.clusterId, clusterIds));

  const subSkillIds = subSkillRows.map((s) => s.id);
  const conceptRows =
    subSkillIds.length === 0
      ? []
      : await db
          .select()
          .from(concepts)
          .where(inArray(concepts.subSkillId, subSkillIds));

  const subSkillToCluster = new Map(
    subSkillRows.map((s) => [s.id, s.clusterId]),
  );

  const perCluster = clusterRows.map((c) => {
    const inCluster = conceptRows.filter(
      (concept) => subSkillToCluster.get(concept.subSkillId) === c.id,
    );
    const understood = inCluster.filter(
      (concept) =>
        concept.status === "understood" || concept.status === "verified",
    ).length;
    return {
      id: c.id,
      name: c.name,
      type: c.type as ClusterType,
      weight: c.weight,
      total: inCluster.length,
      understood,
    };
  });

  const understoodCount = conceptRows.filter(
    (c) => c.status === "understood" || c.status === "verified",
  ).length;
  const verifiedCount = conceptRows.filter(
    (c) => c.status === "verified",
  ).length;

  const recentUnderstood =
    subSkillIds.length === 0
      ? []
      : await db
          .select({
            id: concepts.id,
            name: concepts.name,
            status: concepts.status,
            understoodAt: concepts.understoodAt,
            subSkillId: concepts.subSkillId,
          })
          .from(concepts)
          .where(
            isNotNull(concepts.understoodAt),
          )
          .orderBy(desc(concepts.understoodAt))
          .limit(20)
          .then((rows) =>
            rows
              .filter((r) => subSkillIds.includes(r.subSkillId))
              .slice(0, 5)
              .map((r) => {
                const subSkill = subSkillRows.find(
                  (s) => s.id === r.subSkillId,
                );
                const cluster = subSkill
                  ? clusterRows.find((c) => c.id === subSkill.clusterId)
                  : undefined;
                return {
                  id: r.id,
                  name: r.name,
                  status: r.status as Status,
                  understoodAt: r.understoodAt!,
                  subSkillName: subSkill?.name ?? "",
                  clusterName: cluster?.name ?? "",
                };
              }),
          );

  const verifiedArtefacts =
    subSkillIds.length === 0
      ? []
      : await db
          .select({
            id: artefacts.id,
            type: artefacts.type,
            title: artefacts.title,
            url: artefacts.url,
            description: artefacts.description,
            verifiedAt: artefacts.verifiedAt,
            subSkillId: artefacts.subSkillId,
          })
          .from(artefacts)
          .where(
            and(
              inArray(artefacts.subSkillId, subSkillIds),
              isNotNull(artefacts.verifiedAt),
            ),
          )
          .orderBy(desc(artefacts.verifiedAt))
          .then((rows) =>
            rows.map((r) => {
              const subSkill = subSkillRows.find((s) => s.id === r.subSkillId);
              const cluster = subSkill
                ? clusterRows.find((c) => c.id === subSkill.clusterId)
                : undefined;
              return {
                id: r.id,
                type: r.type as ArtefactType,
                title: r.title,
                url: r.url,
                description: r.description,
                verifiedAt: r.verifiedAt!,
                clusterName: cluster?.name ?? "",
                clusterType: (cluster?.type ?? "technical") as ClusterType,
                subSkillName: subSkill?.name ?? "",
              };
            }),
          );

  return {
    publicProfile: profileRow,
    syllabus: currentSyllabus,
    clusters: perCluster,
    totals: {
      total: conceptRows.length,
      understood: understoodCount,
      verified: verifiedCount,
    },
    recentUnderstood,
    verifiedArtefacts,
  };
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { handle } = await params;
  const profile = await loadProfile(handle);
  if (!profile) return { title: "Not found" };
  if (!profile.syllabus) {
    return { title: `${profile.publicProfile.displayName} — Provency` };
  }
  return {
    title: `${profile.publicProfile.displayName} → ${profile.syllabus.targetRole} — Provency`,
    description: `${profile.publicProfile.displayName}'s public learning profile.`,
  };
}

export default async function PublicProfilePage({ params }: PageProps) {
  const { handle } = await params;

  const profile = await loadProfile(handle);
  if (!profile) notFound();
  if (!profile.syllabus) {
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-12 sm:px-6 sm:py-20 lg:px-8">
        <h1 className="text-3xl font-semibold tracking-tight">
          {profile.publicProfile.displayName}
        </h1>
        <p className="text-muted-foreground">
          No syllabus generated yet.
        </p>
      </main>
    );
  }

  const { publicProfile, syllabus, clusters, totals, recentUnderstood, verifiedArtefacts } =
    profile;
  const percent =
    totals.total > 0
      ? Math.round((totals.understood / totals.total) * 100)
      : 0;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 py-12 sm:gap-14 sm:px-6 sm:py-20 lg:px-8">
      <Link
        href="/syllabi"
        className="text-muted-foreground/60 hover:text-muted-foreground -mb-10 inline-flex w-fit items-center gap-1 text-xs transition-colors"
      >
        ← Back to syllabi
      </Link>

      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          {publicProfile.displayName}
        </h1>
        <p className="text-muted-foreground text-sm sm:text-base">
          Public learning profile.
        </p>
        <div className="border-border/60 mt-3 flex flex-col gap-1 border-l-2 pl-4">
          <span className="text-muted-foreground text-xs uppercase tracking-wide">
            Currently working toward
          </span>
          <p className="text-lg font-medium">
            {syllabus.targetRole}
            {syllabus.targetCompany ? (
              <span className="text-muted-foreground font-normal">
                {" "}
                · {syllabus.targetCompany}
              </span>
            ) : null}
          </p>
          <span className="text-muted-foreground text-xs">
            Syllabus generated {format(syllabus.createdAt, "MMMM yyyy")}
          </span>
        </div>
      </header>

      <section className="flex flex-col gap-4">
        <h2 className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
          Progress
        </h2>
        <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg bg-border">
          <Stat
            value={totals.understood}
            of={totals.total}
            label="Understood"
          />
          <Stat
            value={totals.verified}
            of={totals.total}
            label="Verified"
            muted
          />
          <Stat value={percent} suffix="%" label="Of syllabus" muted />
        </div>
        <div className="bg-muted h-1 w-full overflow-hidden rounded-full">
          <div
            className="bg-foreground/70 h-full transition-all"
            style={{ width: `${percent}%` }}
          />
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
          By cluster
        </h2>
        <ul className="flex flex-col gap-3">
          {clusters.map((cluster) => {
            const style = CLUSTER_TYPE_STYLE[cluster.type];
            const pct =
              cluster.total > 0
                ? (cluster.understood / cluster.total) * 100
                : 0;
            return (
              <li
                key={cluster.id}
                className="flex flex-col gap-2"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      className={`size-1.5 shrink-0 rounded-full ${style.dot}`}
                      aria-hidden
                    />
                    <span className="truncate text-sm font-medium">
                      {cluster.name}
                    </span>
                    <span className="text-muted-foreground shrink-0 text-[10px] uppercase tracking-wide">
                      {style.label}
                    </span>
                  </div>
                  <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                    {cluster.understood} / {cluster.total}
                  </span>
                </div>
                <div className="bg-muted/60 h-0.5 w-full overflow-hidden rounded-full">
                  <div
                    className="bg-foreground/50 h-full transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
          Recent activity
        </h2>
        {recentUnderstood.length === 0 ? (
          <p className="text-muted-foreground text-sm">No activity yet.</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {recentUnderstood.map((c) => (
              <li
                key={c.id}
                className="flex items-baseline justify-between gap-3 text-sm"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{c.name}</span>
                  <span className="text-muted-foreground truncate text-xs">
                    {c.clusterName} · {c.subSkillName}
                  </span>
                </div>
                <span
                  className="text-muted-foreground shrink-0 text-xs"
                  title={format(c.understoodAt, "d MMM yyyy, HH:mm")}
                >
                  {formatDistanceToNow(c.understoodAt, { addSuffix: true })}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
          Verified artefacts
        </h2>
        {verifiedArtefacts.length === 0 ? (
          <div className="border-border/60 bg-card/30 rounded-md border border-dashed px-5 py-8 text-center">
            <p className="text-muted-foreground text-sm">
              No verified artefacts yet.
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              Projects, writeups, and contributions will appear here as they're
              verified.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {verifiedArtefacts.map((a) => {
              const meta = ARTEFACT_META[a.type];
              const Icon = meta.icon;
              return (
                <li
                  key={a.id}
                  className="border-border/60 bg-card/40 flex flex-col gap-2 rounded-md border px-4 py-3"
                >
                  <div className="flex items-start gap-3">
                    <Icon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                    <div className="flex flex-1 flex-col gap-1">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className="text-muted-foreground text-[10px] uppercase tracking-wide">
                          {meta.label}
                        </span>
                        {a.url ? (
                          <a
                            href={a.url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
                          >
                            {a.title}
                            <ExternalLink className="size-3" />
                          </a>
                        ) : (
                          <span className="text-sm font-medium">
                            {a.title}
                          </span>
                        )}
                      </div>
                      <span className="text-muted-foreground text-xs">
                        {a.clusterName} · {a.subSkillName}
                      </span>
                      {a.description ? (
                        <p className="text-foreground/85 mt-1 text-xs leading-relaxed">
                          {a.description}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <footer className="border-border/60 text-muted-foreground flex items-center justify-between border-t pt-6 text-xs">
        <span>provency.ai · public learning profile</span>
        <span>Updated {format(new Date(), "d MMM yyyy")}</span>
      </footer>
    </main>
  );
}

function Stat({
  value,
  of,
  label,
  suffix,
  muted = false,
}: {
  value: number;
  of?: number;
  label: string;
  suffix?: string;
  muted?: boolean;
}) {
  return (
    <div className="bg-background flex flex-col gap-1 px-3 py-4 sm:px-4 sm:py-5">
      <div className="flex flex-wrap items-baseline gap-x-1">
        <span
          className={`text-2xl font-semibold tabular-nums sm:text-3xl ${muted ? "text-foreground/80" : "text-foreground"}`}
        >
          {value}
        </span>
        {of !== undefined ? (
          <span className="text-muted-foreground text-xs tabular-nums sm:text-sm">
            / {of}
          </span>
        ) : null}
        {suffix ? (
          <span className="text-muted-foreground text-xs sm:text-sm">
            {suffix}
          </span>
        ) : null}
      </div>
      <span className="text-muted-foreground text-[10px] uppercase tracking-wider sm:text-[11px]">
        {label}
      </span>
    </div>
  );
}
