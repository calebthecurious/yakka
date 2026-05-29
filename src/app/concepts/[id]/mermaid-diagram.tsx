"use client";

import { useEffect, useRef, useState } from "react";

let mermaidLoad: Promise<typeof import("mermaid").default> | null = null;

function loadMermaid(): Promise<typeof import("mermaid").default> {
  if (!mermaidLoad) {
    mermaidLoad = import("mermaid").then((mod) => {
      const mermaid = mod.default;
      mermaid.initialize({
        startOnLoad: false,
        theme: "dark",
        securityLevel: "strict",
        fontFamily: "inherit",
        themeVariables: {
          background: "transparent",
          primaryColor: "#1f2937",
          primaryTextColor: "#e5e7eb",
          primaryBorderColor: "#374151",
          lineColor: "#6b7280",
          tertiaryColor: "#111827",
        },
      });
      return mermaid;
    });
  }
  return mermaidLoad;
}

export function MermaidDiagram({ chart }: { chart: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    let cancelled = false;
    const id = `mermaid-${Math.random().toString(36).slice(2, 10)}`;

    loadMermaid()
      .then(async (mermaid) => {
        if (cancelled || !containerRef.current) return;
        try {
          const { svg } = await mermaid.render(id, chart);
          if (!cancelled && containerRef.current) {
            containerRef.current.innerHTML = svg;
            setState("ready");
          }
        } catch (err) {
          console.warn("[MermaidDiagram] render failed", err);
          if (!cancelled) setState("failed");
        }
      })
      .catch((err) => {
        console.warn("[MermaidDiagram] load failed", err);
        if (!cancelled) setState("failed");
      });

    return () => {
      cancelled = true;
    };
  }, [chart]);

  if (state === "failed") return null;

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-base font-semibold">Relationship map</h3>
      <div
        ref={containerRef}
        className="border-border/60 bg-card/30 flex w-full justify-center overflow-x-auto rounded-md border p-4 [&_svg]:h-auto [&_svg]:max-w-full"
      />
    </section>
  );
}
