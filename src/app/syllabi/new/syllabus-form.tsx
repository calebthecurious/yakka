"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createSyllabus, type CreateSyllabusState } from "./actions";
import { extractResumeText } from "./extract-resume";
import { GenerationLoading } from "./generation-loading";
import {
  DEFAULT_SYLLABUS_PURPOSE,
  SYLLABUS_PURPOSES,
  type SyllabusPurpose,
} from "@/lib/syllabus-purpose";
import { PURPOSE_COPY } from "@/lib/syllabus-purpose-copy";

const initialState: CreateSyllabusState = { status: "idle" };

export function SyllabusForm() {
  const [state, action, isPending] = useActionState(
    createSyllabus,
    initialState,
  );
  // W-2: presentation-layer framing only. The generator is identical for both
  // purposes; this selects which copy the form shows and what the row records.
  const [purpose, setPurpose] = useState<SyllabusPurpose>(DEFAULT_SYLLABUS_PURPOSE);
  const copy = PURPOSE_COPY[purpose];
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
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">What is this for?</legend>
        <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Purpose">
          {SYLLABUS_PURPOSES.map((value) => {
            const c = PURPOSE_COPY[value];
            const selected = purpose === value;
            return (
              <label
                key={value}
                className={cn(
                  "flex cursor-pointer flex-col gap-1 rounded-lg border px-4 py-3 transition-colors",
                  selected
                    ? "border-primary/50 bg-primary/[0.06]"
                    : "border-border/60 bg-card hover:border-foreground/30",
                )}
              >
                <input
                  type="radio"
                  name="purpose"
                  value={value}
                  checked={selected}
                  onChange={() => setPurpose(value)}
                  className="sr-only"
                />
                <span className="text-sm font-medium">{c.selector.label}</span>
                <span className="text-muted-foreground text-xs">{c.selector.description}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="targetRole">{copy.form.roleLabel}</Label>
          <Input
            id="targetRole"
            name="targetRole"
            required
            maxLength={120}
            placeholder={copy.form.rolePlaceholder}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="targetCompany">
            {copy.form.companyLabel}{" "}
            <span className="text-muted-foreground text-xs">(optional)</span>
          </Label>
          <Input
            id="targetCompany"
            name="targetCompany"
            maxLength={120}
            placeholder={copy.form.companyPlaceholder}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="jobDescription">{copy.form.jdLabel}</Label>
        <Textarea
          id="jobDescription"
          name="jobDescription"
          required
          rows={12}
          placeholder={copy.form.jdPlaceholder}
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
        <p className="text-muted-foreground text-xs">{copy.form.skillsHelp}</p>
      </div>

      {state.status === "error" ? (
        <div
          role="alert"
          className="border-destructive/40 bg-destructive/10 text-destructive flex flex-col gap-2 rounded-md border px-3 py-3 text-sm"
        >
          <p className="font-medium">Something went wrong</p>
          <p className="opacity-90">{state.message}</p>
          <p className="opacity-90">
            Your inputs are still here — you can try again right away.
          </p>
          <Button
            type="submit"
            variant="outline"
            size="sm"
            className="border-destructive/40 mt-1 w-fit"
          >
            Try again
          </Button>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground text-xs">
          This usually takes 1–3 minutes. Once it starts you can leave this page —
          generation continues in the background.
        </p>
        <Button
          type="submit"
          disabled={isPending}
          className="w-full sm:w-auto"
        >
          {isPending ? copy.form.submitting : copy.form.submit}
        </Button>
      </div>

      {isPending ? <GenerationLoading /> : null}
    </form>
  );
}
