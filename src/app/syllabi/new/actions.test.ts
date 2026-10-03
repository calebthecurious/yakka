import { describe, it, expect, vi, afterEach } from "vitest";

// Capture the args passed to db.insert(...).values(...) and stub the returning().
const dbMocks = vi.hoisted(() => {
  const values = vi.fn(() => ({
    returning: () => Promise.resolve([{ id: "syll-1" }]),
  }));
  const insert = vi.fn(() => ({ values }));
  // W-5: the action counts the user's active syllabi before inserting.
  const state = { activeCount: 0 };
  const select = vi.fn(() => ({
    from: () => ({ where: () => Promise.resolve([{ n: state.activeCount }]) }),
  }));
  return { insert, values, select, state };
});
vi.mock("@/db", () => ({ db: { insert: dbMocks.insert, select: dbMocks.select } }));

// The whole point of req 1: NO generation runs on the request path. actions.ts
// no longer imports any generator — it only schedules the worker via after() —
// so we mock the worker and assert it's deferred, never called inline.
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
  dbMocks.state.activeCount = 0;
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

    // The worker is scheduled to run AFTER the response, on the new syllabus id.
    expect(serverMocks.calls).toHaveLength(1);
    await serverMocks.calls[0]();
    expect(runMocks.runSyllabusGeneration).toHaveBeenCalledWith("syll-1");

    // And the user is sent to the syllabus page immediately.
    expect(navMocks.redirect).toHaveBeenCalledWith("/syllabi/syll-1");
  });

  it("W-1/W-2: purpose defaults to get_hired when the form sends none — the old flow is unchanged", async () => {
    const { createSyllabus } = await import("./actions");
    const fd = form({
      targetRole: "ML Engineer",
      targetCompany: "",
      jobDescription: "x".repeat(60),
      currentSkills: "y".repeat(30),
    });
    await expect(createSyllabus({ status: "idle" }, fd)).rejects.toThrow("REDIRECT:");
    expect(dbMocks.values).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: "get_hired" }),
    );
  });

  it("W-2: purpose=current_role is threaded to the row, with the same generator path", async () => {
    const { createSyllabus } = await import("./actions");
    const fd = form({
      purpose: "current_role",
      targetRole: "Signal Processing Engineer",
      targetCompany: "Seer Medical",
      jobDescription: "x".repeat(60),
      currentSkills: "y".repeat(30),
    });
    await expect(createSyllabus({ status: "idle" }, fd)).rejects.toThrow("REDIRECT:/syllabi/syll-1");
    expect(dbMocks.values).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: "current_role", status: "generating" }),
    );
    // Same worker, same arguments — no generator variant in this slice.
    expect(serverMocks.calls).toHaveLength(1);
    await serverMocks.calls[0]();
    expect(runMocks.runSyllabusGeneration).toHaveBeenCalledWith("syll-1");
  });

  it("W-2: an unknown purpose is rejected before the database", async () => {
    const { createSyllabus } = await import("./actions");
    const result = await createSyllabus(
      { status: "idle" },
      form({
        purpose: "promotion",
        targetRole: "ML Engineer",
        targetCompany: "",
        jobDescription: "x".repeat(60),
        currentSkills: "y".repeat(30),
      }),
    );
    expect(result).toEqual({ status: "error", message: expect.any(String) });
    expect(dbMocks.insert).not.toHaveBeenCalled();
  });

  it("W-5: at the free-tier boundary the action refuses with the wall message and inserts nothing", async () => {
    const { createSyllabus } = await import("./actions");
    dbMocks.state.activeCount = 1; // one active syllabus already
    const result = await createSyllabus(
      { status: "idle" },
      form({
        targetRole: "Second Role",
        targetCompany: "",
        jobDescription: "x".repeat(60),
        currentSkills: "y".repeat(30),
      }),
    );
    expect(result).toEqual({ status: "error", message: expect.stringContaining("Premium") });
    expect(result).toEqual({ status: "error", message: expect.stringContaining("nothing to buy") });
    expect(dbMocks.insert).not.toHaveBeenCalled();
    expect(serverMocks.calls).toHaveLength(0);
  });

  it("W-5: a failed syllabus does not occupy the slot (count excludes failed) and a raised limit is honoured", async () => {
    const { createSyllabus } = await import("./actions");
    vi.stubEnv("FREE_TIER_ACTIVE_SYLLABI", "2");
    dbMocks.state.activeCount = 1;
    await expect(
      createSyllabus(
        { status: "idle" },
        form({ targetRole: "R", targetCompany: "", jobDescription: "x".repeat(60), currentSkills: "y".repeat(30) }),
      ),
    ).rejects.toThrow("REDIRECT:/syllabi/syll-1");
    expect(dbMocks.insert).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid input before touching the database", async () => {
    const { createSyllabus } = await import("./actions");

    const result = await createSyllabus(
      { status: "idle" },
      form({ targetRole: "", jobDescription: "too short", currentSkills: "" }),
    );

    expect(result).toEqual({ status: "error", message: expect.any(String) });
    expect(dbMocks.insert).not.toHaveBeenCalled();
  });
});
