import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles, syllabi } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { Separator } from "@/components/ui/separator";
import { SettingsForm } from "./settings-form";
import { FeaturedSyllabusForm } from "./featured-syllabus-form";
import { SignOutButton } from "./sign-out-button";

export const metadata: Metadata = {
  title: "Settings — Provency",
};

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [profile] = await db
    .select({
      handle: profiles.handle,
      displayName: profiles.displayName,
      headline: profiles.headline,
      githubUrl: profiles.githubUrl,
      linkedinUrl: profiles.linkedinUrl,
      websiteUrl: profiles.websiteUrl,
      showLearningTrail: profiles.showLearningTrail,
      showSelfAssessed: profiles.showSelfAssessed,
      showCurrentlyDeveloping: profiles.showCurrentlyDeveloping,
    })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);

  // The middleware sends handle-less users to /profile/setup, but guard anyway.
  if (!profile?.handle) redirect("/profile/setup");

  const syllabusRows = await db
    .select({
      id: syllabi.id,
      targetRole: syllabi.targetRole,
      targetCompany: syllabi.targetCompany,
      isFeatured: syllabi.isFeaturedOnProfile,
    })
    .from(syllabi)
    .where(eq(syllabi.userId, user.id))
    .orderBy(desc(syllabi.createdAt));

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground text-sm">
          Manage your account and public profile.
        </p>
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
          Account
        </h2>
        <div className="border-border/60 bg-card/40 flex items-center justify-between gap-4 rounded-md border px-4 py-3">
          <div className="flex flex-col">
            <span className="text-muted-foreground text-xs">Email</span>
            <span className="text-sm">{user.email}</span>
          </div>
        </div>
      </section>

      <Separator />

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
            Featured role
          </h2>
          <p className="text-muted-foreground text-xs">
            The one target role shown on your public profile. Only this
            syllabus&apos;s progress is made public.
          </p>
        </div>
        <FeaturedSyllabusForm syllabi={syllabusRows} handle={profile.handle} />
      </section>

      <Separator />

      <section className="flex flex-col gap-4">
        <h2 className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
          Public profile
        </h2>
        <SettingsForm
          displayName={profile.displayName}
          handle={profile.handle}
          headline={profile.headline}
          githubUrl={profile.githubUrl}
          linkedinUrl={profile.linkedinUrl}
          websiteUrl={profile.websiteUrl}
          showLearningTrail={profile.showLearningTrail}
          showSelfAssessed={profile.showSelfAssessed}
          showCurrentlyDeveloping={profile.showCurrentlyDeveloping}
        />
      </section>

      <Separator />

      <section className="flex items-center justify-between gap-4">
        <div className="flex flex-col">
          <span className="text-sm font-medium">Sign out</span>
          <span className="text-muted-foreground text-xs">
            End your session on this device.
          </span>
        </div>
        <SignOutButton />
      </section>
    </main>
  );
}
