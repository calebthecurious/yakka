"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { setFeaturedSyllabus } from "./actions";

export type FeaturableSyllabus = {
  id: string;
  targetRole: string;
  targetCompany: string | null;
  isFeatured: boolean;
};

export function FeaturedSyllabusForm({
  syllabi,
  handle,
}: {
  syllabi: FeaturableSyllabus[];
  handle: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function choose(syllabusId: string | null) {
    startTransition(async () => {
      const result = await setFeaturedSyllabus({ syllabusId });
      if (!result.ok) {
        alert(result.message ?? "Could not update featured role.");
        return;
      }
      router.refresh();
    });
  }

  if (syllabi.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Generate a syllabus first — then you can feature one here.
      </p>
    );
  }

  const anyFeatured = syllabi.some((s) => s.isFeatured);

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {syllabi.map((s) => {
          const featured = s.isFeatured;
          return (
            <li key={s.id}>
              <button
                type="button"
                disabled={isPending}
                onClick={() => choose(featured ? null : s.id)}
                aria-pressed={featured}
                className={cn(
                  "flex w-full cursor-pointer items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-left transition-colors",
                  featured
                    ? "border-foreground/40 bg-card"
                    : "border-border/60 bg-card/40 hover:border-foreground/20",
                  isPending && "opacity-60",
                )}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">
                    {s.targetRole}
                  </span>
                  {s.targetCompany ? (
                    <span className="text-muted-foreground truncate text-xs">
                      {s.targetCompany}
                    </span>
                  ) : null}
                </span>
                <span
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 text-xs",
                    featured ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {featured ? (
                    <>
                      <Check className="size-3.5" aria-hidden />
                      Featured · tap to remove
                    </>
                  ) : (
                    "Feature on profile"
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
        {isPending ? (
          <Loader2 className="size-3 animate-spin" aria-hidden />
        ) : null}
        {anyFeatured ? (
          <>
            Shown at{" "}
            <span className="text-foreground">provency.ai/u/{handle}</span>
          </>
        ) : (
          "No role is featured yet — your public profile falls back to your most recent syllabus."
        )}
      </p>
    </div>
  );
}
