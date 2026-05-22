"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setProfileHandle, type ProfileSetupState } from "../actions";

const INITIAL_STATE: ProfileSetupState = { status: "idle" };

export function HandleForm() {
  const [state, formAction, pending] = useActionState(
    setProfileHandle,
    INITIAL_STATE,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="handle">Handle</Label>
        <Input
          id="handle"
          name="handle"
          autoComplete="username"
          required
          minLength={3}
          maxLength={32}
          pattern="[a-z0-9](?:[a-z0-9\-]{1,30}[a-z0-9])?"
          placeholder="your-name"
        />
      </div>

      {state.status === "error" ? (
        <p className="text-destructive text-sm">{state.message}</p>
      ) : null}

      <Button type="submit" disabled={pending}>
        Save handle
      </Button>
    </form>
  );
}
