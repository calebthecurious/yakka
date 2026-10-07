# Landing v2 — design handoff (PR-4a)

Design only. Source: `docs/design/landing-v2.pen` (open with the pen.dev
VS Code extension). Exports: `landing-v2-desktop.png` (1440 × 2643 @2x) and
`landing-v2-mobile.png` (390 × 2393 @2x). No code was changed.

Two frames, same content, same order: **Landing Desktop 1440** and
**Landing Mobile 390**. Sections top to bottom: Nav · Hero · Constellation ·
Steps · Employer band · Footer. Nothing else.

## Variables (import as CSS tokens)

Every colour, type and spacing value on the page is bound to one of these.
Themed values use the pen theme axis `device` (`desktop` | `phone`); the
implementation should read them as a `md:` breakpoint.

| Variable | Type | Desktop | Phone | Used for |
|---|---|---|---|---|
| `bg` | color | `#0A0A0F` | — | page background (explicit fill, no section backgrounds) |
| `surface` | color | `#12121A` | — | Constellation centre disc only |
| `line` | color | `#1F1F2A` | — | tier rings, sector dividers, secondary-CTA border, not-started node stroke |
| `text-primary` | color | `#ECECF1` | — | headline, step lines, legend labels, nav |
| `text-secondary` | color | `#8B8B99` | — | lead, trust line, captions, cluster labels, step numbers, self-assessed outline |
| `accent` | color | `#00D9C0` | — | primary CTA fill; artefact-verified node fill; stroke on both verified fills |
| `accent-check` | color | `#00D9C0D9` | — | check-passed node fill (accent at 85%, mirrors `emerald-400/85` in the component) |
| `accent-ring` | color | `#00D9C059` | — | the ring that marks an artefact (accent at 35%, mirrors `emerald-300/35`) |
| `node-in-progress` | color | `#6E6E80` | — | in-progress node fill |
| `node-not-started` | color | `#262631` | — | not-started node fill |
| `font-display` | string | Instrument Serif | — | headline, section headings, step numbers, wordmark, centre number |
| `font-text` | string | Geist | — | everything else |
| `size-display-xl` | number | 84 | 44 | hero headline (line-height 1.04 / 1.06) |
| `size-display-lg` | number | 40 | 30 | section heading, positioning line (line-height 1.1) |
| `size-display-md` | number | 28 | 24 | nav wordmark, step numbers |
| `size-text-lg` | number | 18 | 16 | lead, step lines, employer sentence (line-height 1.6 body / 1.45 steps) |
| `size-text-md` | number | 16 | 15 | CTA labels (weight 500) |
| `size-text-sm` | number | 14 | — | nav link, legend labels, mobile cluster list |
| `size-text-xs` | number | 12 | — | trust line, legend note, captions, footer links |
| `space-1` … `space-4` | number | 8, 16, 24, 32 | — | intra-group gaps |
| `space-6`, `space-8`, `space-12`, `space-20` | number | 48, 64, 96, 160 | — | group gaps, hero top padding (96 desktop / 64 phone) |
| `gutter` | number | 120 | 16 | horizontal page padding |
| `section-gap` | number | 160 | 96 | vertical rhythm between sections |
| `radius-pill` | number | 999 | — | both CTAs |

Text uses exactly two greys (`text-primary`, `text-secondary`). The accent
appears only on the primary CTA and on verified-tier nodes and their
swatch. No gradients, glows, blurs, borders on cards, or section fills.

## Copy I wrote (needs your review)

- Step 01: **Paste the role you're aiming for.**
- Step 02: **Build toward it and log the evidence.**
- Step 03: **Share a record a hiring manager can check.**
- Employer sentence: **A record keeps claims separate from evidence: every
  verified concept is backed by a passed competency check or a finished
  artefact, dated, and open for you to inspect.**
- Constellation caption: **Example record — not a real profile.** (adapted
  from the dev preview's "Dev fixture preview — not a real profile").

Everything else is existing copy, verbatim: the headline, the lead (see cut
below), "Start my record", the trust line, "A public profile that shows you
can do the work" (PR-2 feature title, now the Constellation heading), the
registered positioning line, "Talk to us about a pilot", the legend note
"Fill is the evidence tier. Verified work sits nearest the centre." and
"· a ring marks an artefact" (both from the component), and the tier words
`Verified` / `Self-assessed` / `In progress` / `Not started` from
`formatTierLabel`. The centre reads `16` / `VERIFIED` / `of 37`, exactly as
the component renders it on the fixture.

## Cuts to approved copy, and why

- **Lead paragraph: removed "Provency is the verification layer:"**
  (52 → 39 words, to meet the ≤40 cap). Both remaining sentences are
  untouched PR-2 text. This clause was the one piece that explained the
  product rather than the reader's problem or the action, so it was the
  cheapest cut; the positioning line in the employer band carries the
  category claim instead.
- **Headline kept.** "Evidence that survives the age of generated
  portfolios." does both jobs: the self-taught developer hears "your real
  work can still count", the recruiter hears "this is about verification,
  not résumés". A shorter line would lose one reader or the other.
- Dropped by the brief's structure, not by taste: Stats strip, the four
  Feature rows and their mock panels, How-it-works body text, Founder note,
  the three reserved testimonial slots, FAQ, Final CTA, and the footer
  tagline and Sign up link. The feature copy about Start Here and Company
  Insight has no home on this page; if it matters, it belongs on /syllabi.

## How the Constellation is drawn

- Data is the real thing: `fixtureInput()` → `computeReadinessLedger` →
  `constellationData`, then the component's own `layout()` maths
  (sector spans, tier radii 205/262/328/390/445, node radius 9 for 37
  nodes). 37 concepts, 16 verified (7 artefact-verified, 9 check-passed),
  6 self-assessed, 5 in progress, 10 not started. Node positions in the
  .pen are the component's to two decimals.
- **Desktop** renders the full 1520 × 1000 viewBox (including the 260-unit
  label padding) at scale 0.72: 1094 × 720 px. Node radius 6.5 px, cluster
  labels 12.2 px, centre number 40 px. Legend sits beneath as one row.
- **Mobile** crops to the inner 1000-unit square at scale 0.358 (358 px wide,
  the full gutter width) and moves the five cluster names and their
  `done / total` counts into a list under the map. At the honest full
  viewBox the outer labels would render at 4 px. See question 1.
- Self-assessed nodes and the self-assessed tier ring are dashed, drawn as
  arc paths because pen has no dash property; in code they stay
  `strokeDasharray`.
- The map is static in the design: no hover tooltip, selected-node panel,
  or time scrubber. See question 3.

## Three questions before implementation

1. **Mobile treatment of the Constellation.** The design crops to the inner
   square and lists clusters beneath, which the component cannot do today
   (it always draws the padded viewBox with labels). Options: add a
   `compact` prop that drops the outer labels and padding; render the
   honest full viewBox and accept 4 px labels; or bump `nodeRadiusFor`
   and label size at small widths. Which?
2. **The two links that don't exist.** No contact address appears anywhere
   in the repo, so "Talk to us about a pilot" has no mailto target yet.
   `/privacy` and `/terms` also have no routes. What address, and do the
   legal pages ship with PR-4b or does the footer link out?
3. **Static fixture or live component?** The dev fixture route 404s in
   production, so the landing can't import that page. Should PR-4b render
   the real `<Constellation>` on the fixture payload (interactive: hover,
   evidence panel, scrubber), or a static SVG snapshot? Related: the
   component colours in-progress sky and verified emerald; this design uses
   grey for in-progress and the `#00D9C0` accent for verified. Does the
   profile adopt these tokens, or does the landing carry its own theme?

## Build vs .pen (PR-4b)

Captured from the dev server at 1440 and 390 in
`landing-v2-impl-desktop.png` and `landing-v2-impl-mobile.png`. The .pen is
unchanged; these are the ratified departures from its frames, and why:

- **Nav gains "For employers"** (anchors to the employer band) beside
  "Log in". The hero has no extra link.
- **Employer band sits above the three steps.** Order is now nav, hero,
  Constellation, employer band, steps, final CTA, footer.
- **Step 03 reads "Share a record anyone can check."** and one line sits
  beneath the three: "Employers define the role standard; candidates build
  toward it; the record proves it." Both are new copy, from the brief.
- **Primary CTA repeats before the footer**, button and trust line only.
- **Time scrubber and the "Select a node…" hint** render under the map:
  they are part of the live component, which is the decision.
- **Trust line keeps "roadmap".** `docs/verification-taxonomy.md` names no
  term for the first generated syllabus, so the word stays.
- **≤768px is the `compact` treatment**: full rings and nodes, centre
  count, no in-SVG cluster labels, and the five cluster names with their
  done / total counts as a list beneath the map (as the mobile frame
  drew). Above 768px `compact` changes nothing.
- **Dim component text on the landing** (scrubber footer, legend notes,
  evidence dates) uses `--lp-text-secondary` instead of the profile's
  muted-70%, so every string clears 4.5:1 on `--lp-bg`. The profile keeps
  its own tones; only its node palette changed.
- **Footer is wordmark, © 2026, Privacy.** No Terms link.
- **/privacy is new, static and public.** Its sentences are new copy, from
  the brief's list: what is collected (Google account email, the profile
  content you create, first-party page analytics, no third-party scripts),
  how to delete an account (mailto for now), and a "Last updated" date.
- **Both mailtos have no recipient yet.** `EMPLOYER_CONTACT_EMAIL` in
  `src/components/landing/landing-chrome.tsx` is empty pending the address
  from the decision; the employer CTA carries subject "Provency pilot".
- **Tokens live in `src/styles/tokens.css`**: the 30 pen variables plus a
  second block of the frames' per-node values (text measures,
  letter-spacing, line-height, button padding) so `page.tsx` holds no
  literal colour or size.
