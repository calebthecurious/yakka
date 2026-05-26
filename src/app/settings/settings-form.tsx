"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateProfile, type SettingsState } from "./actions";

const INITIAL_STATE: SettingsState = { status: "idle" };

export function SettingsForm({
  displayName,
  handle,
}: {
  displayName: string;
  handle: string;
}) {
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
