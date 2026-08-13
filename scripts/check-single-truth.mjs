#!/usr/bin/env node
/**
 * check:single-truth — fails when a surface derives PROGRESS from raw rows
 * instead of from the readiness ledger.
 *
 * The rule this enforces: `src/lib/readiness/` is the only place allowed to turn
 * raw `concepts.status`, competency scores, or `artefacts.verifiedAt` into a
 * count, a percentage, or an evidence claim. Everything else consumes what that
 * module returns.
 *
 * NOT a naive grep. Raw status is legitimate in two shapes that a plain pattern
 * match cannot tell apart from a violation:
 *   - status INPUT — a checkbox or a server action reading/validating one
 *     concept's own status (`concept.status === "understood"` on its own line);
 *   - per-row DISPLAY — rendering one artefact's own completion badge.
 * What makes it a violation is AGGREGATION: a raw predicate inside a filter /
 * some / every / reduce, i.e. deriving a number across rows. That is what this
 * script looks for, plus two unambiguous markers (an inline pass bar, and
 * hand-built evidence labels).
 *
 * No allowlist, by decision. If this is red, the fix is to move the derivation
 * into the ledger module — not to add an exception here.
 *
 * Usage: node scripts/check-single-truth.mjs [--verbose]
 * Exit 0 = clean, 1 = violations found.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");
const LEDGER_DIR = join("src", "lib", "readiness");
const VERBOSE = process.argv.includes("--verbose");

/** Raw progress predicates — the P1.1 audit patterns. */
const RAW_PREDICATES = [
  { re: /status\s*===\s*["']understood["']/, what: 'status === "understood"' },
  { re: /status\s*===\s*["']verified["']/, what: 'status === "verified"' },
  { re: /status\s*===\s*["']learning["']/, what: 'status === "learning"' },
  { re: /status\s*===\s*["']completed["']/, what: 'status === "completed"' },
  { re: /verifiedAt\s*(!==?|===?)\s*null/, what: "verifiedAt null-check" },
];

/** Unambiguous violations wherever they appear — no aggregation needed. */
const ALWAYS = [
  {
    re: /PASS_THRESHOLD/,
    what: "inline pass bar (import PASS_BAR from the ledger)",
  },
  {
    re: /["'`]Competency check passed/,
    what: "hand-built evidence label (use formatEvidenceLabel)",
  },
  {
    re: /["'`]Demonstrated in /,
    what: "hand-built evidence label (use formatEvidenceLabel)",
  },
];

/**
 * Find the character span of every aggregation call, by matching the opening
 * paren to its real closing paren. A line window is not good enough: an
 * unrelated `.some(...)` two lines above a per-row status check would flag it.
 */
function aggregatorSpans(text) {
  const spans = [];
  const finder = /\.(filter|some|every|reduce)\s*\(/g;
  let m;
  while ((m = finder.exec(text)) !== null) {
    const open = m.index + m[0].length - 1;
    let depth = 0;
    let close = -1;
    for (let i = open; i < text.length; i++) {
      const ch = text[i];
      if (ch === "(") depth++;
      else if (ch === ")") {
        depth--;
        if (depth === 0) {
          close = i;
          break;
        }
      }
    }
    if (close !== -1) spans.push([open, close]);
  }
  return spans;
}

const lineOf = (text, index) => text.slice(0, index).split("\n").length;

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function inLedgerModule(relPath) {
  return relPath.split(sep).join("/").startsWith(LEDGER_DIR.split(sep).join("/"));
}

const violations = [];

for (const file of walk(SRC)) {
  const rel = relative(ROOT, file);
  if (inLedgerModule(rel)) continue; // the ledger IS allowed to do this

  const text = readFileSync(file, "utf8");
  const lines = text.split(/\r?\n/);

  lines.forEach((line, i) => {
    for (const rule of ALWAYS) {
      if (rule.re.test(line)) {
        violations.push({ rel, line: i + 1, what: rule.what, src: line.trim() });
      }
    }
  });

  // A raw predicate is a violation only when it sits INSIDE an aggregation —
  // that is what turns one row's status into a number across rows.
  const spans = aggregatorSpans(text);
  const seen = new Set();
  for (const [open, close] of spans) {
    const inner = text.slice(open, close + 1);
    for (const rule of RAW_PREDICATES) {
      const hit = rule.re.exec(inner);
      if (!hit) continue;
      const lineNo = lineOf(text, open + hit.index);
      const key = `${lineNo}:${rule.what}`;
      if (seen.has(key)) continue; // nested spans report the same hit once
      seen.add(key);
      violations.push({
        rel,
        line: lineNo,
        what: `aggregation over raw ${rule.what}`,
        src: (lines[lineNo - 1] ?? "").trim(),
      });
    }
  }
}

if (violations.length === 0) {
  console.log("check:single-truth — OK, no progress derived from raw rows outside src/lib/readiness/");
  process.exit(0);
}

console.error(
  `check:single-truth — ${violations.length} violation${violations.length === 1 ? "" : "s"}:\n`,
);
const byFile = new Map();
for (const v of violations) {
  const list = byFile.get(v.rel) ?? [];
  list.push(v);
  byFile.set(v.rel, list);
}
for (const [rel, list] of byFile) {
  console.error(`  ${rel}`);
  for (const v of list) {
    console.error(`    :${v.line}  ${v.what}`);
    if (VERBOSE) console.error(`           ${v.src}`);
  }
}
console.error(
  "\nProgress must be derived inside src/lib/readiness/ and consumed from there.",
);
console.error("There is no allowlist — move the derivation, don't except it.\n");
process.exit(1);
