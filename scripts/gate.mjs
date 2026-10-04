#!/usr/bin/env node
/**
 * The pre-commit gate, as exit codes. `npm run gate`.
 *
 * Runs, in order, stopping at the first failure:
 *   1. tsc --noEmit
 *   2. vitest run                 (the whole suite; nothing skipped)
 *   3. check:single-truth
 *   4. eslint on files changed vs origin/main (the lint baseline on main is
 *      known-red, so only NEW problems gate — see CLAUDE.md memory)
 *
 * Why this exists: on 2026-10-04 a commit landed with a failing test because
 * the commit chain grepped the runner's output for a summary line instead of
 * checking its exit code — a grep that matches is exit 0 whatever the test
 * result. A gate is a process exit code, never a pattern match. This script
 * is the only sanctioned way to say "gates green" in a commit message.
 *
 * Usage: node scripts/gate.mjs [--no-lint]   exit 0 = all green, else the
 * failing step's exit code, with the step named on stderr.
 */

import { spawnSync } from "node:child_process";

const isWin = process.platform === "win32";
const run = (label, cmd, args) => {
  console.log(`\n── gate: ${label}`);
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: isWin });
  const code = r.status ?? 1;
  if (code !== 0) {
    console.error(`\nGATE FAILED at "${label}" (exit ${code}). Nothing after it ran.`);
    process.exit(code);
  }
};

run("typecheck", "npx", ["tsc", "--noEmit"]);
run("tests (vitest run, full suite)", "npx", ["vitest", "run"]);
run("single-truth", "node", ["scripts/check-single-truth.mjs"]);

if (!process.argv.includes("--no-lint")) {
  const diff = spawnSync(
    "git",
    ["diff", "--name-only", "origin/main...HEAD", "--", "*.ts", "*.tsx", "*.mjs"],
    { encoding: "utf8", shell: isWin },
  );
  const staged = spawnSync("git", ["diff", "--name-only", "--cached", "--", "*.ts", "*.tsx", "*.mjs"], {
    encoding: "utf8",
    shell: isWin,
  });
  // Unstaged edits and brand-new files too: the gate runs BEFORE `git add`,
  // so the work it is meant to judge is usually not yet staged.
  const unstaged = spawnSync("git", ["diff", "--name-only", "--", "*.ts", "*.tsx", "*.mjs"], {
    encoding: "utf8",
    shell: isWin,
  });
  const untracked = spawnSync(
    "git",
    ["ls-files", "--others", "--exclude-standard", "--", "*.ts", "*.tsx", "*.mjs"],
    { encoding: "utf8", shell: isWin },
  );
  const files = [
    ...new Set(
      `${diff.stdout}\n${staged.stdout}\n${unstaged.stdout}\n${untracked.stdout}`
        .split(/\r?\n/)
        .filter(Boolean)
        .filter((f) => !f.startsWith(".tmp-")),
    ),
  ];
  if (files.length === 0) {
    console.log("\n── gate: lint — no changed .ts/.tsx/.mjs files vs origin/main; skipped");
  } else {
    run(`lint (${files.length} changed file${files.length === 1 ? "" : "s"})`, "npx", ["eslint", ...files]);
  }
}

console.log("\nGATE GREEN — typecheck, full test suite, single-truth, lint on changed files.");
