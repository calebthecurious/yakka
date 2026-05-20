import type { Metadata } from "next";
import Link from "next/link";
import { SyllabusForm } from "./syllabus-form";

export const metadata: Metadata = {
  title: "New syllabus — Yakka",
};

export default function NewSyllabusPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex flex-col gap-2">
        <Link
          href="/syllabi"
          className="text-muted-foreground hover:text-foreground text-xs"
        >
          ← All syllabi
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">New syllabus</h1>
        <p className="text-muted-foreground max-w-prose">
          Paste a job description and a sketch of your current skills. Yakka
          will generate a clustered syllabus — sub-skills, resources, and one
          portfolio artefact per cluster — tuned for a self-taught learner
          targeting this exact role.
        </p>
      </header>
      <SyllabusForm />
    </main>
  );
}
