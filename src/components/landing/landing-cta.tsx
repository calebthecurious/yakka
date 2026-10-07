"use client";

/**
 * One-click "Continue with Google" CTA for the public landing page.
 *
 * Mirrors the Google path in `src/components/auth-form.tsx` (same browser client,
 * same redirectTo → /auth/callback?next=...) so the landing's dominant CTA starts
 * OAuth with zero form friction. New users without a handle land on /profile/setup
 * via middleware after the callback; everyone else goes to `next`.
 *
 * Styled with the landing tokens (`--lp-*`, globals.css): the accent fill is
 * reserved for this button and for verified-tier nodes, nothing else on the page.
 */

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Props = {
  /** Where to land after auth. Defaults to the app home. */
  next?: string;
  label?: string;
  className?: string;
};

export function LandingCta({
  next = "/syllabi",
  label = "Continue with Google",
  className,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGoogle() {
    setError(null);
    setLoading(true);
    const supabase = createClient();
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });
      // On success the browser is redirected to Google; we only reach here on error.
      if (error) {
        setError(error.message);
        setLoading(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setLoading(false);
    }
  }

  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <button
        type="button"
        onClick={handleGoogle}
        disabled={loading}
        className={cn(
          "inline-flex h-13 w-full cursor-pointer items-center justify-center gap-3 rounded-full px-7",
          "bg-(--lp-accent) text-(--lp-bg) text-(length:--lp-size-text-md) font-medium",
          "transition-[transform,filter] duration-200 hover:-translate-y-0.5 hover:brightness-105 motion-reduce:transition-none motion-reduce:hover:translate-y-0",
          "outline-none focus-visible:ring-[3px] focus-visible:ring-(--lp-text-primary)/60 focus-visible:ring-offset-2 focus-visible:ring-offset-(--lp-bg)",
          "disabled:pointer-events-none disabled:opacity-60",
        )}
      >
        {loading ? (
          <Loader2 className="size-5 animate-spin motion-reduce:animate-none" aria-hidden />
        ) : (
          <GoogleIcon />
        )}
        {loading ? "Redirecting…" : label}
      </button>
      {error ? (
        <p className="text-destructive text-xs" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="size-5" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.23 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}
