"use client";

import { useEffect } from "react";
import {
  SessionDedupe,
  artefactIdFrom,
  dwellBucket,
  isProfileSection,
  type KeyValueStore,
} from "@/lib/analytics/profile-view";
import { recordProfileView } from "./actions";

/**
 * First-party profile analytics beacon (P5.4a + P5.4b). Renders nothing.
 *
 * Events, each once per browser session per profile:
 *  - view            on mount
 *  - section         when a `[data-section]` element is ≥50% visible for ≥1s
 *  - artefact_click  on any `a[data-artefact-id]` click (cards + Constellation)
 *  - dwell           on first visibilitychange→hidden or pagehide, as a BUCKET
 *                    of total visible time, via navigator.sendBeacon
 *
 * What is sent: the handle, the event type, `document.referrer`,
 * `location.search` (for utm_*), a random per-session token, and the
 * per-type field (section id / artefact id / dwell bucket). Nothing about
 * the device, no scroll position, no exact durations. No third-party script.
 */

/** Visible for at least this long before a section counts as engaged. */
const SECTION_MIN_VISIBLE_MS = 1000;
const SECTION_THRESHOLD = 0.5;
const DWELL_ENDPOINT = "/u/beacon"; // public prefix; see src/app/u/beacon/route.ts

function sessionStore(): KeyValueStore | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function visitorKey(store: KeyValueStore | null): string | null {
  try {
    let key = store?.getItem("pv:visitor") ?? null;
    if (!key) {
      key = crypto.randomUUID();
      store?.setItem("pv:visitor", key);
    }
    return key;
  } catch {
    return null;
  }
}

export function ProfileViewBeacon({ handle }: { handle: string }) {
  useEffect(() => {
    const store = sessionStore();
    const dedupe = new SessionDedupe(store, handle);
    const vk = visitorKey(store);
    const common = {
      handle,
      referrer: document.referrer || null,
      search: window.location.search || null,
      visitorKey: vk,
    };
    const send = (payload: Record<string, unknown>) =>
      recordProfileView({ ...common, ...payload }).catch(() => {
        /* measurement never surfaces to the viewer */
      });

    // ── view ──
    if (dedupe.claim("view")) void send({ eventType: "view" });

    // ── section: ≥50% visible for ≥1s, once per section per session ──
    const timers = new Map<string, number>();
    const observer =
      "IntersectionObserver" in window
        ? new IntersectionObserver(
            (entries) => {
              for (const entry of entries) {
                const id = (entry.target as HTMLElement).dataset.section;
                if (!isProfileSection(id)) continue;
                if (entry.isIntersecting && entry.intersectionRatio >= SECTION_THRESHOLD) {
                  if (timers.has(id) || dedupe.seen("section", id)) continue;
                  timers.set(
                    id,
                    window.setTimeout(() => {
                      timers.delete(id);
                      if (dedupe.claim("section", id)) {
                        void send({ eventType: "section", section: id });
                      }
                      observer?.unobserve(entry.target);
                    }, SECTION_MIN_VISIBLE_MS),
                  );
                } else {
                  const t = timers.get(id);
                  if (t != null) {
                    window.clearTimeout(t);
                    timers.delete(id);
                  }
                }
              }
            },
            { threshold: [SECTION_THRESHOLD] },
          )
        : null;
    if (observer) {
      document.querySelectorAll<HTMLElement>("[data-section]").forEach((el) => {
        if (isProfileSection(el.dataset.section)) observer.observe(el);
      });
    }

    // ── artefact_click: delegated, once per artefact per session ──
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      const link = target?.closest?.("a[data-artefact-id]") as HTMLElement | null;
      const id = artefactIdFrom(link?.dataset.artefactId);
      if (!id) return;
      if (dedupe.claim("artefact_click", id)) {
        void send({ eventType: "artefact_click", artefactId: id });
      }
    };
    document.addEventListener("click", onClick, { capture: true });

    // ── dwell: total visible time, bucketed, sent once on first hide ──
    let visibleSince: number | null = document.visibilityState === "visible" ? performance.now() : null;
    let visibleMs = 0;
    const accumulate = () => {
      if (visibleSince != null) {
        visibleMs += performance.now() - visibleSince;
        visibleSince = null;
      }
    };
    const sendDwell = () => {
      accumulate();
      if (!dedupe.claim("dwell")) return;
      const body = JSON.stringify({
        ...common,
        eventType: "dwell",
        dwellBucket: dwellBucket(visibleMs),
      });
      try {
        if (!navigator.sendBeacon?.(DWELL_ENDPOINT, new Blob([body], { type: "application/json" }))) {
          void fetch(DWELL_ENDPOINT, { method: "POST", body, keepalive: true, headers: { "content-type": "application/json" } }).catch(() => {});
        }
      } catch {
        /* unloading; nothing to do */
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") sendDwell();
      else if (visibleSince == null) visibleSince = performance.now();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", sendDwell);

    return () => {
      observer?.disconnect();
      for (const t of timers.values()) window.clearTimeout(t);
      document.removeEventListener("click", onClick, { capture: true });
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", sendDwell);
    };
  }, [handle]);

  return null;
}
