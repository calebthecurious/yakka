"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { updateProfile, type SettingsState } from "./actions";

const INITIAL_STATE: SettingsState = { status: "idle" };

export type SettingsFormProps = {
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

export function SettingsForm({
  displayName,
  handle,
  headline,
  githubUrl,
  linkedinUrl,
  websiteUrl,
  showLearningTrail,
  showSelfAssessed,
  showCurrentlyDeveloping,
}: SettingsFormProps) {
  const [state, formAction, pending] = useActionState(
    updateProfile,
    INITIAL_STATE,
  );

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="displayName">Display name</Label>
        <Input
          id="displayName"
          name="displayName"
          defaultValue={displayName}
          required
          maxLength={60}
          autoComplete="name"
        />
        <p className="text-muted-foreground text-xs">
          Shown on your public profile.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="handle">Handle</Label>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-sm">provency.ai/u/</span>
          <Input
            id="handle"
            name="handle"
            defaultValue={handle}
            autoComplete="username"
            required
            minLength={3}
            maxLength={32}
            pattern="[a-z0-9](?:[a-z0-9\-]{1,30}[a-z0-9])?"
            className="flex-1"
          />
        </div>
        <p className="text-muted-foreground text-xs">
          Lowercase letters, numbers, and hyphens. Changing this changes your
          public profile URL.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="headline">Headline</Label>
        <Input
          id="headline"
          name="headline"
          defaultValue={headline ?? ""}
          maxLength={140}
          placeholder="One honest line about what you're building toward."
        />
        <p className="text-muted-foreground text-xs">
          Optional. A single line shown under your name. Your own words — never
          auto-generated.
        </p>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">External links</legend>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="githubUrl" className="text-muted-foreground text-xs">
            GitHub
          </Label>
          <Input
            id="githubUrl"
            name="githubUrl"
            type="url"
            inputMode="url"
            defaultValue={githubUrl ?? ""}
            placeholder="https://github.com/you"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="linkedinUrl" className="text-muted-foreground text-xs">
            LinkedIn
          </Label>
          <Input
            id="linkedinUrl"
            name="linkedinUrl"
            type="url"
            inputMode="url"
            defaultValue={linkedinUrl ?? ""}
            placeholder="https://linkedin.com/in/you"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="websiteUrl" className="text-muted-foreground text-xs">
            Website
          </Label>
          <Input
            id="websiteUrl"
            name="websiteUrl"
            type="url"
            inputMode="url"
            defaultValue={websiteUrl ?? ""}
            placeholder="https://yoursite.com"
          />
        </div>
        <p className="text-muted-foreground text-xs">
          Optional. All links must start with http(s):// and open in a new tab.
        </p>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">Public sections</legend>
        <p className="text-muted-foreground -mt-1 text-xs">
          Your artefacts, verified competencies, and readiness counts are always
          public. Choose what else a recruiter sees.
        </p>
        <ToggleRow
          name="showLearningTrail"
          label="Learning trail"
          hint="How you learned — resources consumed, by type."
          defaultChecked={showLearningTrail}
        />
        <ToggleRow
          name="showSelfAssessed"
          label="Self-assessed understanding"
          hint="Concepts you've marked understood but not yet backed by evidence."
          defaultChecked={showSelfAssessed}
        />
        <ToggleRow
          name="showCurrentlyDeveloping"
          label="Currently developing"
          hint="In-progress areas, framed honestly."
          defaultChecked={showCurrentlyDeveloping}
        />
      </fieldset>

      {state.status === "error" ? (
        <p className="text-destructive text-sm">{state.message}</p>
      ) : null}
      {state.status === "success" ? (
        <p className="text-sm text-emerald-300">Saved.</p>
      ) : null}

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

function ToggleRow({
  name,
  label,
  hint,
  defaultChecked,
}: {
  name: string;
  label: string;
  hint: string;
  defaultChecked: boolean;
}) {
  return (
    <label
      htmlFor={name}
      className="border-border/60 bg-card/40 flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5"
    >
      <Checkbox
        id={name}
        name={name}
        defaultChecked={defaultChecked}
        className="mt-0.5"
      />
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-muted-foreground text-xs">{hint}</span>
      </span>
    </label>
  );
}
