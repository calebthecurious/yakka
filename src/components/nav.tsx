"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, LogOut, Settings, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type NavUser = {
  displayName: string;
  handle: string;
  email: string;
};

const LINKS = [
  { href: "/syllabi", label: "My syllabi", match: /^\/syllabi(?!\/new)/ },
  { href: "/syllabi/new", label: "New syllabus", match: /^\/syllabi\/new/ },
];

function Brand() {
  return (
    <Link
      href="/syllabi"
      className="flex shrink-0 items-center gap-2 text-sm font-semibold tracking-tight"
    >
      <span className="bg-foreground text-background rounded-sm px-1.5 py-0.5 text-[10px] font-bold uppercase">
        Provency
      </span>
    </Link>
  );
}

function shell(children: React.ReactNode) {
  return (
    <nav className="border-border/60 bg-background/80 sticky top-0 z-40 w-full border-b backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-2 px-4 py-3 sm:px-6 lg:px-8">
        {children}
      </div>
    </nav>
  );
}

export function Nav({ user }: { user: NavUser | null }) {
  const pathname = usePathname();

  // Public profile pages render their own full-bleed chrome.
  if (pathname.startsWith("/u/")) return null;

  // Logged out, or mid handle-selection: brand only, no distractions.
  if (!user) {
    return shell(<Brand />);
  }

  return shell(
    <>
      <div className="flex items-center gap-4 sm:gap-6">
        <Brand />
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
      </div>
      <UserMenu user={user} />
    </>,
  );
}

function UserMenu({ user }: { user: NavUser }) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const initial = user.displayName.trim().charAt(0).toUpperCase() || "?";

  async function handleSignOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="hover:bg-muted/50 flex items-center gap-2 rounded-md py-1 pr-1.5 pl-1 text-sm transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        aria-label="Account menu"
      >
        <Avatar className="size-7">
          <AvatarFallback>{initial}</AvatarFallback>
        </Avatar>
        <span className="hidden max-w-[12ch] truncate font-medium sm:inline">
          {user.displayName}
        </span>
        <ChevronDown className="text-muted-foreground size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-56">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="truncate">{user.displayName}</span>
          <span className="text-muted-foreground truncate text-xs font-normal">
            {user.email}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={`/u/${user.handle}`}>
            <UserRound />
            Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={(e) => {
            e.preventDefault();
            void handleSignOut();
          }}
          disabled={signingOut}
        >
          <LogOut />
          {signingOut ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
