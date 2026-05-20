"use client";

import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { addArtefact } from "./actions";

type ArtefactType = "project" | "writeup" | "certificate" | "contribution";

const TYPES: ArtefactType[] = ["project", "writeup", "certificate", "contribution"];

type SubSkillOption = { id: string; name: string };

export function ArtefactForm({
  syllabusId,
  subSkillOptions,
}: {
  syllabusId: string;
  subSkillOptions: SubSkillOption[];
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<ArtefactType>("project");
  const [subSkillId, setSubSkillId] = useState<string>(
    subSkillOptions[0]?.id ?? "",
  );
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (subSkillOptions.length === 0) return null;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const title = (fd.get("title") as string | null)?.trim() ?? "";
    const url = (fd.get("url") as string | null)?.trim() ?? "";
    const description = (fd.get("description") as string | null)?.trim() ?? "";
    const reflection = (fd.get("reflection") as string | null)?.trim() ?? "";

    if (title.length === 0) {
      setError("Title is required.");
      return;
    }

    const form = e.currentTarget;
    startTransition(async () => {
      const result = await addArtefact({
        syllabusId,
        subSkillId,
        type,
        title,
        url: url || undefined,
        description: description || undefined,
        reflection: reflection || undefined,
        verified,
      });
      if (!result.ok) {
        setError(result.message ?? "Add failed.");
        return;
      }
      form.reset();
      setType("project");
      setSubSkillId(subSkillOptions[0]?.id ?? "");
      setVerified(false);
      setOpen(false);
    });
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-foreground h-8 gap-1.5 px-2 text-xs"
        >
          {open ? <X className="size-3.5" /> : <Plus className="size-3.5" />}
          {open ? "Cancel" : "Log artefact"}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <form
          onSubmit={onSubmit}
          className="border-border/60 bg-card/40 mt-3 flex flex-col gap-3 rounded-md border p-4"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="artefact-title" className="text-xs">
              Title
            </Label>
            <Input
              id="artefact-title"
              name="title"
              required
              placeholder="e.g. CHB-MIT seizure detection benchmark"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="artefact-type" className="text-xs">
                Type
              </Label>
              <select
                id="artefact-type"
                value={type}
                onChange={(e) => setType(e.target.value as ArtefactType)}
                className="border-input bg-background h-9 rounded-md border px-3 text-sm capitalize"
              >
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="artefact-subskill" className="text-xs">
                Demonstrates
              </Label>
              <select
                id="artefact-subskill"
                value={subSkillId}
                onChange={(e) => setSubSkillId(e.target.value)}
                className="border-input bg-background h-9 rounded-md border px-3 text-sm"
              >
                {subSkillOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="artefact-url" className="text-xs">
              URL (optional)
            </Label>
            <Input
              id="artefact-url"
              name="url"
              type="url"
              placeholder="https://github.com/... or a deploy URL"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="artefact-description" className="text-xs">
              Description (optional)
            </Label>
            <Textarea
              id="artefact-description"
              name="description"
              rows={2}
              placeholder="What it is, briefly."
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="artefact-reflection" className="text-xs">
              Reflection (optional)
            </Label>
            <Textarea
              id="artefact-reflection"
              name="reflection"
              rows={3}
              placeholder="What you learned, what was hard, what you'd do differently."
            />
          </div>

          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={verified}
              onChange={(e) => setVerified(e.target.checked)}
              className="border-input size-3.5 rounded"
            />
            <span>
              Mark as verified
              <span className="text-muted-foreground">
                {" "}
                — shows on public profile.
              </span>
            </span>
          </label>

          {error ? <p className="text-destructive text-xs">{error}</p> : null}

          <div className="flex items-center justify-end gap-2">
            <Button
              type="submit"
              size="sm"
              disabled={isPending}
              className={cn("h-8 text-xs", isPending && "opacity-70")}
            >
              {isPending ? "Logging..." : "Log artefact"}
            </Button>
          </div>
        </form>
      </CollapsibleContent>
    </Collapsible>
  );
}
