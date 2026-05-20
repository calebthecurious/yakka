"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { FileUp, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createSyllabus, type CreateSyllabusState } from "./actions";
import { extractResumeText } from "./extract-resume";

const initialState: CreateSyllabusState = { status: "idle" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full sm:w-auto">
      {pending ? "Generating — 10-30s…" : "Generate syllabus"}
    </Button>
  );
}

export function SyllabusForm() {
  const [state, action] = useActionState(createSyllabus, initialState);
  const [currentSkills, setCurrentSkills] = useState("");
  const [resumeStatus, setResumeStatus] = useState<
    | { kind: "idle" }
    | { kind: "extracting"; name: string }
    | { kind: "extracted"; name: string; chars: number }
    | { kind: "error"; message: string }
  >({ kind: "idle" });
  const [isExtracting, startExtraction] = useTransition();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function onResumeChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setResumeStatus({ kind: "extracting", name: file.name });

    startExtraction(async () => {
      const fd = new FormData();
      fd.append("resume", file);
      const result = await extractResumeText(fd);
      if (!result.ok) {
        setResumeStatus({ kind: "error", message: result.message });
        return;
      }
      setCurrentSkills((prev) => {
        if (prev.trim().length === 0) return result.text;
        return `${prev.trim()}\n\n--- From resume (${file.name}) ---\n${result.text}`;
      });
      setResumeStatus({
        kind: "extracted",
        name: file.name,
        chars: result.text.length,
      });
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <form action={action} className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="targetRole">Target role</Label>
          <Input
            id="targetRole"
            name="targetRole"
            required
            maxLength={120}
            placeholder="e.g. ML Engineer, neural decoding"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="targetCompany">
            Target company{" "}
            <span className="text-muted-foreground text-xs">(optional)</span>
          </Label>
          <Input
            id="targetCompany"
            name="targetCompany"
            maxLength={120}
            placeholder="e.g. Seer Medical"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="jobDescription">Job description</Label>
        <Textarea
          id="jobDescription"
          name="jobDescription"
          required
          rows={12}
          placeholder="Paste the full JD here."
          className="font-mono text-sm"
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <Label htmlFor="currentSkills">
            Your current skills and background
          </Label>

          <div className="flex flex-col items-end gap-1">
            <input
              ref={fileInputRef}
              id="resume-upload"
              type="file"
              accept=".pdf,application/pdf"
              onChange={onResumeChosen}
              className="hidden"
            />
            <label
              htmlFor="resume-upload"
              className={cn(
                "border-border bg-background text-muted-foreground hover:text-foreground hover:border-foreground/30 inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors",
                isExtracting && "pointer-events-none opacity-70",
              )}
            >
              {isExtracting ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <FileUp className="size-3.5" aria-hidden />
              )}
              {isExtracting ? "Extracting…" : "Upload resume (PDF)"}
            </label>
            {resumeStatus.kind === "extracted" ? (
              <span className="text-muted-foreground text-[11px]">
                Loaded {resumeStatus.chars.toLocaleString()} chars from{" "}
                {resumeStatus.name}
              </span>
            ) : null}
            {resumeStatus.kind === "error" ? (
              <span className="text-destructive text-[11px]">
                {resumeStatus.message}
              </span>
            ) : null}
          </div>
        </div>

        <Textarea
          id="currentSkills"
          name="currentSkills"
          required
          rows={6}
          value={currentSkills}
          onChange={(e) => setCurrentSkills(e.target.value)}
          placeholder="A few sentences on what you already know, what you've built, and your formal background — or upload your resume."
        />
        <p className="text-muted-foreground text-xs">
          The AI uses this to identify credential/experience gaps and suggest
          alternative target roles where your actual profile is viable.
        </p>
      </div>

      {state.status === "error" ? (
        <p
          role="alert"
          className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
        >
          {state.message}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground text-xs">
          Grok takes 30-60 seconds. Don&apos;t refresh.
        </p>
        <SubmitButton />
      </div>
    </form>
  );
}
