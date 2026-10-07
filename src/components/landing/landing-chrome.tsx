import Link from "next/link";

/**
 * The landing's own nav and footer (docs/design/landing-v2.pen), shared by
 * "/" and "/privacy". The global <Nav> returns null on both routes. Every
 * colour and size is an `--lp-*` token from src/styles/tokens.css.
 */

/**
 * FILL before push: the address the employer cold emails went from. It is not
 * in the repo, so it could not be filled here. Until it is set, the employer
 * CTA and the privacy page's deletion request are mailtos with a subject and
 * no recipient.
 */
export const EMPLOYER_CONTACT_EMAIL = "";

export const lpDisplay = "font-(family-name:--lp-font-display) font-normal";
export const lpSecondary = "text-(--lp-text-secondary)";
export const lpFocusRing =
  "outline-none focus-visible:ring-[3px] focus-visible:ring-(--lp-text-primary)/60 focus-visible:ring-offset-2 focus-visible:ring-offset-(--lp-bg)";

const navLink = `${lpFocusRing} rounded-sm text-(length:--lp-size-text-sm) hover:opacity-80`;

export function LandingNav() {
  return (
    <header className="flex w-full items-center justify-between px-(--lp-gutter) py-(--lp-space-3) max-md:py-(--lp-space-2)">
      <Link
        href="/"
        className={`${lpDisplay} ${lpFocusRing} rounded-sm text-(length:--lp-size-display-md) tracking-(--lp-tracking-display-md)`}
      >
        Provency
      </Link>
      <nav aria-label="Site" className="flex items-center gap-(--lp-space-3)">
        <Link href="/#employers" className={navLink}>
          For employers
        </Link>
        <Link href="/login" className={navLink}>
          Log in
        </Link>
      </nav>
    </header>
  );
}

export function LandingFooter() {
  return (
    <footer className="flex w-full items-center justify-between px-(--lp-gutter) pt-(--lp-section-gap) pb-(--lp-space-6) max-md:flex-col max-md:items-start max-md:gap-(--lp-space-2) max-md:pb-(--lp-space-4)">
      <span
        className={`${lpDisplay} text-(length:--lp-size-wordmark-footer) tracking-(--lp-tracking-wordmark)`}
      >
        Provency
      </span>
      <div className={`${lpSecondary} flex items-center gap-(--lp-space-3) text-(length:--lp-size-text-xs)`}>
        <span>© 2026</span>
        <Link
          href="/privacy"
          className={`${lpFocusRing} rounded-sm underline-offset-4 hover:text-(--lp-text-primary) hover:underline`}
        >
          Privacy
        </Link>
      </div>
    </footer>
  );
}
