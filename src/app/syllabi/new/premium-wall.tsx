import Link from "next/link";
import { Sparkles } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { PREMIUM_WILL_INCLUDE, WALL_COPY, type CreateDecision } from "@/lib/entitlements";

/**
 * The "Premium coming" state (W-5). Shown on /syllabi/new when the account
 * is at the free-tier boundary. A plain statement, not a paywall: no price,
 * no button that pretends to buy, no waiting list, no countdown. Renders
 * only what src/lib/entitlements.ts says.
 */
export function PremiumWall({ decision }: { decision: CreateDecision }) {
  return (
    <section
      aria-labelledby="premium-wall"
      className="border-border/60 bg-card/40 flex flex-col gap-5 rounded-xl border p-6"
    >
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-sky-300" aria-hidden />
        <h2 id="premium-wall" className="text-lg font-semibold tracking-tight">
          {WALL_COPY.title}
        </h2>
      </div>
      <p className="text-foreground/85 max-w-prose text-sm leading-relaxed">
        {WALL_COPY.body(decision.limit, decision.active)}
      </p>
      <div className="flex flex-col gap-2">
        <p className="text-muted-foreground text-xs tracking-wide uppercase">{WALL_COPY.listIntro}</p>
        <ul className="flex flex-col gap-1.5">
          {PREMIUM_WILL_INCLUDE.map((item) => (
            <li key={item} className="text-foreground/85 flex items-baseline gap-2 text-sm">
              <span className="bg-foreground/30 mt-1.5 size-1 shrink-0 rounded-full" aria-hidden />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-muted-foreground max-w-prose text-xs">{WALL_COPY.honesty}</p>
      <div>
        <Link href="/syllabi" className={buttonVariants({ variant: "outline", size: "sm" })}>
          {WALL_COPY.back}
        </Link>
      </div>
    </section>
  );
}
