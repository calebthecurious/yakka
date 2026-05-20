"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateArtefactCore } from "./actions";

type ArtefactType = "project" | "writeup" | "certificate" | "contribution";

const TYPES: ArtefactType[] = [
  "project",
  "writeup",
  "certificate",
  "contribution",
];

type Props = {
  artefactId: string;
  type: ArtefactType;
  title: string;
  description: string;
  url: string | null;
  evidenceUrl: string | null;
  reflection: string;
};

export function ArtefactCoreForm(props: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(props.title);
  const [type, setType] = useState<ArtefactType>(props.type);
  const [description, setDescription] = useState(props.description);
  const [url, setUrl] = useState(props.url ?? "");
  const [evidenceUrl, setEvidenceUrl] = useState(props.evidenceUrl ?? "");
  const [reflection, setReflection] = useState(props.reflection);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("idle");
    setErrorMsg(null);
    startTransition(async () => {
      const result = await updateArtefactCore({
        artefactId: props.artefactId,
        title: title.trim(),
        description: description.trim(),
        url: url.trim() || undefined,
        evidenceUrl: evidenceUrl.trim() || undefined,
        reflection: reflection.trim(),
        type,
      });
      if (!result.ok) {
        setStatus("error");
        setErrorMsg(result.message ?? "Save failed.");
        return;
      }
      setStatus("saved");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="artefact-title" className="text-xs">
            Title
          </Label>
          <Input
            id="artefact-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>
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
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="artefact-description" className="text-xs">
          Description
        </Label>
        <Textarea
          id="artefact-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="What this artefact is."
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="artefact-url" className="text-xs">
            Primary URL{" "}
            <span className="text-muted-foreground">(repo, deploy, etc.)</span>
          </Label>
          <Input
            id="artefact-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="artefact-evidence-url" className="text-xs">
            Evidence URL{" "}
            <span className="text-muted-foreground">
              (writeup, screenshot, demo)
            </span>
          </Label>
          <Input
            id="artefact-evidence-url"
            type="url"
            value={evidenceUrl}
            onChange={(e) => setEvidenceUrl(e.target.value)}
            placeholder="https://"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="artefact-reflection" className="text-xs">
          Reflection
        </Label>
        <Textarea
          id="artefact-reflection"
          value={reflection}
          onChange={(e) => setReflection(e.target.value)}
          rows={3}
          placeholder="What you learned. What was hard. What you'd do differently."
        />
      </div>

      {errorMsg ? (
        <p className="text-destructive text-xs">{errorMsg}</p>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <span
          className={cn(
            "text-xs",
            status === "saved" && "text-emerald-300",
            status === "error" && "text-destructive",
            status === "idle" && "text-muted-foreground",
          )}
        >
          {status === "saved" && "Saved."}
          {status === "error" && (errorMsg ?? "Save failed.")}
        </span>
        <Button
          type="submit"
          size="sm"
          disabled={isPending}
          className={cn(isPending && "opacity-70")}
        >
          {isPending ? "Saving..." : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
