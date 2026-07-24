import { describe, it, expect, vi, afterEach } from "vitest";

// Capture the args passed to db.insert(...).values(...) and stub the returning().
const dbMocks = vi.hoisted(() => {
  const values = vi.fn(() => ({
    returning: () => Promise.resolve([{ id: "syll-1" }]),
  }));
  const insert = vi.fn(() => ({ values }));
  return { insert, values };
});
vi.mock("@/db", () => ({ db: { insert: dbMocks.insert } }));

// The whole point of req 1: NO generator runs on the request path.
const aiMocks = vi.hoisted(() => ({ generateSyllabus: vi.fn() }));
vi.mock("@/lib/ai/generate-syllabus", () => ({
  generateSyllabus: aiMocks.generateSyllabus,
}));

const runMocks = vi.hoisted(() => ({ runSyllabusGeneration: vi.fn() }));
vi.mock("@/lib/generation/run", () => ({
  runSyllabusGeneration: runMocks.runSyllabusGeneration,
}));

vi.mock("@/lib/auth", () => ({
  requireCurrentUserId: () => Promise.resolve("user-1"),
}));

// redirect() throws in real Next; model that so we can assert the target URL.
const navMocks = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("next/navigation", () => ({ redirect: navMocks.redirect }));

// after() defers work past the response; capture the callback(s).
const serverMocks = vi.hoisted(() => {
  const calls: Array<() => unknown> = [];
  const after = vi.fn((cb: () => unknown) => {
    calls.push(cb);
  });
  return { after, calls };
});
vi.mock("next/server", () => ({ after: serverMocks.after }));

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  serverMocks.calls.length = 0;
});

describe("createSyllabus — resumable path persists before generation (req 1)", () => {
  it("writes a 'generating' skeleton row, runs no generator, then kicks the worker and redirects", async () => {
    const { createSyllabus } = await import("./actions");

    const fd = form({
      targetRole: "ML Engineer",
      targetCompany: "", // the real form always submits this (optional) field
      jobDescription: "x".repeat(60),
      currentSkills: "y".repeat(30),
    });

    await expect(createSyllabus({ status: "idle" }, fd)).rejects.toThrow(
      "REDIRECT:/syllabi/syll-1",
    );

    // Persisted immediately, in 'generating' state, with the skeleton pending.
    expect(dbMocks.values).toHaveBeenCalledTimes(1);
    expect(dbMocks.values).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        targetRole: "ML Engineer",
        jobDescriptionText: "x".repeat(60),
        status: "generating",
        skeletonStatus: "pending",
        metadata: expect.objectContaining({ currentSkills: "y".repeat(30) }),
      }),
    );

    // No Grok / generation call happened on the request path.
    expect(aiMocks.generateSyllabus).not.toHaveBeenCalled();

    // The worker is scheduled to run AFTER the response, on the new syllabus id.
    expect(serverMocks.calls).toHaveLength(1);
    await serverMocks.calls[0]();
    expect(runMocks.runSyllabusGeneration).toHaveBeenCalledWith("syll-1");

    // And the user is sent to the syllabus page immediately.
    expect(navMocks.redirect).toHaveBeenCalledWith("/syllabi/syll-1");
  });

  it("rejects invalid input before touching the database", async () => {
    const { createSyllabus } = await import("./actions");

    const result = await createSyllabus(
      { status: "idle" },
      form({ targetRole: "", jobDescription: "too short", currentSkills: "" }),
    );

    expect(result).toEqual({ status: "error", message: expect.any(String) });
    expect(dbMocks.insert).not.toHaveBeenCalled();
    expect(aiMocks.generateSyllabus).not.toHaveBeenCalled();
  });
});
