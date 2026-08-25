# Medtech artefact — Layer 0

Track B, week 1. The grounding document beneath the technical spec: what is
being built, for whom, why it is credible coming from this builder, and what
would make it fail. The spec (datasets, acceptance criteria, README skeleton)
sits on top of this and is written second.

> **Terminology note.** "Layer-0 doc" comes from the Upgrade Plan v1 sequencing
> map, which never defines it, and the term appears nowhere else in this repo.
> Working definition used here: **the layer beneath the spec** — problem,
> audience, credibility thesis, and failure modes. If Layer 0 was meant to be
> something else, this doc is cheap to re-cut; the analysis below survives.

**Status:** framing sections complete. Sections marked OPEN await two research
briefs commissioned 2026-08-25 (company status; dataset and evaluation
landscape). Nothing here should be treated as final until those land.

---

## 1. What this artefact is for

From `docs/roadmap.md` (18 Jul), unchanged and still governing:

> Build one genuine medtech-relevant artefact as a standalone GitHub repo with
> a strong README. It has value with or without Provency. Cold-email it to a
> specific person at Seer/Epiminder with one concrete insight.

Two constraints do the real work here, and both are easy to lose sight of:

1. **The repo is the primary object.** Provency frames it. If the artefact is
   only interesting as a Provency demo, it has failed. The test: would a
   working engineer in this field star it, fork it, or use it, knowing nothing
   about Provency?
2. **The cold email is the action, not the artefact.** The artefact exists to
   make one specific email worth replying to. An artefact nobody is emailed
   about scores zero against the North Star.

## 2. Who it is for

Three distinct readers, in priority order. They want different things and the
artefact must not be tuned only to the first.

| Reader | What earns their attention | What loses it |
|---|---|---|
| **An engineer at the target company** | Something that saves them real time or names a real problem precisely. Working code, honest limits. | A toy reimplementation of a solved thing; overclaimed results. |
| **A hiring manager** | Evidence of judgement — scoping, documentation, knowing what NOT to build. | Volume without focus; a README that oversells. |
| **Caleb himself** | Genuine domain traction that compounds toward Synchron/Neuralink. | A one-off stunt with nothing to build on. |

## 3. The builder — an honest profile

This is the section the plan was missing, and it changes the recommendation.

**Evidenced background** (from his own résumé text in prod syllabus metadata,
and 51 public GitHub repos under `calebthecurious`):

- Bachelor of Business (Entrepreneurship & Marketing) plus a coding bootcamp.
  Self-described: "I went to business school and emerged a programmer."
- ~10 years in digital marketing and marketing technology; founder experience.
- Web developer at an apparel group: HTML/CSS/JS/TypeScript, PHP data scripts,
  a Magento → Shopify migration, third-party integrations.
- GitHub is overwhelmingly **TypeScript/JavaScript web projects**, with a
  minority of Python repos. Recent work (this repo) shows he ships genuinely
  sophisticated TypeScript systems fast, with AI assistance — a
  weighted-ledger domain model, a resumable background worker with atomic
  claim semantics, a single-source-of-truth guard script with real tests.

**What he is not:** a signal-processing engineer, an ML researcher, or a
biomedical-engineering graduate. There is no evidence of DSP, neuroscience, or
scientific-Python depth.

**The trap this creates.** The roadmap's own examples — "a seizure-detection
benchmark, an EEG/signal-processing pipeline" — quietly assume a Python/ML/DSP
profile. If Caleb trains a seizure-detection model, he is competing on the one
axis where his CV is weakest, against biomedical-engineering PhDs who have done
it for years, and a mediocre result is worse than no artefact: it invites the
exact "self-taught, out of his depth" judgement the whole strategy exists to
defeat. **Do not build a model whose selling point is its accuracy.**

**The opening.** His actual, demonstrated strengths are: making messy systems
usable, ruthless honesty about what a number does and does not mean (the
readiness ledger is literally a project about refusing to overclaim evidence),
documentation, developer experience, and shipping finished things. Those are
scarce in research-adjacent ML code. An artefact where **tooling, evaluation
rigour, and reproducibility are the point** puts his strengths on the critical
path and his gaps off it — while still being genuinely, unarguably useful.

Whether the field has a gap shaped like that is the question the research
briefs are answering. Early signal from the ledger module itself is that his
best work is exactly this: *insisting a number means what it claims to mean.*

## 4. Selection criteria for the artefact

A candidate must pass all six. Written before the options, deliberately, so the
criteria are not retrofitted to a favourite.

1. **Useful standalone.** A stranger in the field benefits without knowing Caleb.
2. **Buildable solo in 3–4 focused days**, on a laptop or free-tier compute.
3. **Data is genuinely obtainable** by an individual — no institutional DUA that
   takes six weeks. (OPEN — research brief.)
4. **Plays to tooling/rigour, not model accuracy.** Success is not "my F1 beats
   theirs."
5. **Carries one concrete, specific insight** that can headline a cold email to
   a named person. Not "I built a thing" — an actual finding.
6. **Honest about limits.** The README must state what it does not do. This is
   the same doctrine as `docs/verification-taxonomy.md`: never claim a stronger
   state than the evidence grants.

## 5. Failure modes to design against

- **The Kaggle rehash.** Another CNN on CHB-MIT. Instantly recognisable as a
  tutorial follow-along; actively negative signal.
- **The unfinished ambition.** Scope so large it ships at 60% and reads as
  abandoned. Better to ship something small and complete.
- **The overclaim.** Any result stated more strongly than the method supports.
  Fatal in a clinical-adjacent field, and it would contradict the exact virtue
  the profile is built on.
- **The Provency dependency.** If removing Provency makes the artefact
  pointless, the artefact is a demo, not a contribution.
- **Silence.** Built, polished, never sent. The most likely failure by far, and
  the only one that is purely a scheduling problem.

## 6. OPEN — pending research briefs

- **Is Seer Medical still trading in 2026?** There is a recollection of
  voluntary administration in 2024–25. If Seer is gone or restructured, one of
  the two named targets in the North Star is invalid and the roadmap needs a
  correction, not a workaround. Being verified now; treat as unknown until then.
- **Epiminder's current status**, hiring posture, and published technical work.
- **Which epilepsy/EEG datasets a solo builder can actually obtain** within
  days, versus which require institutional agreements.
- **What already exists** (MNE, Braindecode, SzCORE, benchmark repos) so the
  artefact does not duplicate maintained work.
- **The evaluation-methodology question** — whether inconsistent metrics and
  patient-wise leakage are a real, acknowledged gap with room for a tool.
- **Named, plausible cold-email recipients** and what they publicly work on.

## 7. Next actions

1. Land both research briefs; fill §6.
2. Put 2–3 concrete candidate artefacts against the §4 criteria. Caleb picks —
   this is his career artefact and the roadmap assigns him the choice.
3. Write the spec on top of this: problem statement, data plan, acceptance
   criteria, README skeleton with its limitations section.
4. Draft the one-insight-per-company email angle before building, so the build
   is aimed at producing that insight rather than hoping one emerges.

---

## Appendix — an unrelated finding worth acting on

While profiling the builder, prod `syllabi.metadata.currentSkills` was found to
contain **other people's résumés in full, including names, personal email
addresses and phone numbers** (Caleb generated syllabi for friends). That text
is stored in a JSONB column and is fed verbatim into AI generation prompts.

Not a Track B issue, but it belongs on the record:
- It sharpens Amendment 2 (environment separation) — prod holds third-party PII.
- It is a direct input to Amendment 8.2 (privacy policy). The ToS/Privacy work
  must cover résumé text about **people who are not the account holder**, which
  is a materially different consent question from the account holder's own data.
- Worth deciding whether `currentSkills` should be retained indefinitely at all.
