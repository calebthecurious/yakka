"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { generateClusterProject } from "./actions";

export function GenerateProjectButton({
  clusterId,
  variant = "default",
  label,
}: {
  clusterId: string;
  variant?: "default" | "outline";
  label?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await generateClusterProject({ clusterId });
      if (!result.ok) {
        alert(`Could not generate project: ${result.message ?? "unknown error"}`);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Button
      type="button"
      variant={variant}
      onClick={handleClick}
      disabled={isPending}
      className={cn("gap-2", isPending && "opacity-70")}
    >
      {isPending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <Sparkles className="size-4" aria-hidden />
      )}
      {isPending
        ? "Generating project guide…"
        : (label ?? "Generate project guide")}
    </Button>
  );
}
