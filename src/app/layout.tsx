import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { eq } from "drizzle-orm";
import "./globals.css";
import { Nav, type NavUser } from "@/components/nav";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Yakka",
  description:
    "Personal learning OS for self-taught knowledge workers targeting specific roles.",
};

async function loadNavUser(): Promise<NavUser | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const [profile] = await db
    .select({ handle: profiles.handle, displayName: profiles.displayName })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);

  // No handle yet => mid handle-selection; the nav stays brand-only.
  if (!profile?.handle) return null;

  return {
    displayName: profile.displayName,
    handle: profile.handle,
    email: user.email ?? "",
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const navUser = await loadNavUser();

  return (
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <Nav user={navUser} />
        {children}
      </body>
    </html>
  );
}
