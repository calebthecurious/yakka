"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/syllabi", label: "My syllabi", match: /^\/syllabi(?!\/new)/ },
  { href: "/syllabi/new", label: "New syllabus", match: /^\/syllabi\/new/ },
  { href: "/u/caleb", label: "Profile", match: /^\/u\// },
];

export function Nav() {
  const pathname = usePathname();
  if (pathname.startsWith("/u/")) return null;

  return (
    <nav className="border-border/60 bg-background/80 sticky top-0 z-40 flex w-full items-center justify-between gap-2 border-b px-4 py-3 backdrop-blur sm:px-6">
      <Link
        href="/syllabi"
        className="flex shrink-0 items-center gap-2 text-sm font-semibold tracking-tight"
      >
        <span className="bg-foreground text-background rounded-sm px-1.5 py-0.5 text-[10px] font-bold uppercase">
          Yakka
        </span>
      </Link>
      <ul className="flex items-center gap-0.5 sm:gap-1">
        {LINKS.map((link) => {
          const active = link.match.test(pathname);
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                className={cn(
                  "rounded-md px-2 py-1.5 text-xs transition-colors sm:px-3 sm:text-sm",
                  active
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                )}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
