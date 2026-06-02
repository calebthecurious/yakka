"use client";

/**
 * One-click "Continue with Google" CTA for the public landing page.
 *
 * Mirrors the Google path in `src/components/auth-form.tsx` (same browser client,
 * same redirectTo → /auth/callback?next=...) so the landing's dominant CTA starts
 * OAuth with zero form friction. New users without a handle land on /profile/setup
 * via middleware after the callback; everyone else goes to `next`.
 */

import { useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Props = {
  /** Where to land after auth. Defaults to the app home. */
  next?: string;
  /** "primary" = dominant high-contrast button; "soft" = quieter on dark panels. */
  variant?: "primary" | "soft";
  size?: "lg" | "xl";
  label?: string;
  className?: string;
};

export function LandingCta({
  next = "/syllabi",
  variant = "primary",
  size = "lg",
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
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={handleGoogle}
        disabled={loading}
        className={cn(
          "group inline-flex cursor-pointer items-center justify-center gap-2.5 rounded-full font-medium",
          "transition-all duration-200 outline-none focus-visible:ring-[3px] focus-visible:ring-sky-400/50",
          "disabled:pointer-events-none disabled:opacity-60",
          size === "xl" ? "h-13 px-7 text-base" : "h-11 px-6 text-sm",
          variant === "primary"
            ? // Restrained high-contrast pill: light on dark, a soft neutral lift on hover.
              "bg-foreground text-background shadow-[0_1px_2px_rgba(0,0,0,0.4)] hover:shadow-[0_6px_24px_-8px_rgba(0,0,0,0.6)] hover:-translate-y-0.5"
            : "border border-border/70 bg-card/60 text-foreground backdrop-blur hover:bg-card hover:-translate-y-0.5",
          className,
        )}
      >
        {loading ? (
          <Loader2 className="size-5 animate-spin" aria-hidden />
        ) : (
          <GoogleIcon />
        )}
        {loading ? "Redirecting…" : label}
        {!loading && (
          <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
        )}
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
