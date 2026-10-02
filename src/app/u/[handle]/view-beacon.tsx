"use client";

import { useEffect } from "react";
import { recordProfileView } from "./actions";

/**
 * Fires one `view` event per browser session per profile (P5.4a). Renders
 * nothing. First-party only: the only network call is the server action, and
 * the only things sent are the handle, `document.referrer`, `location.search`
 * (for utm_*), and a random per-session token. No third-party script, no
 * cookies, no fingerprinting.
 */
export function ProfileViewBeacon({ handle }: { handle: string }) {
  useEffect(() => {
    let seenKey: string | null = null;
    let visitorKey: string | null = null;
    try {
      seenKey = `pv:seen:${handle}`;
      if (sessionStorage.getItem(seenKey)) return;
      visitorKey = sessionStorage.getItem("pv:visitor");
      if (!visitorKey) {
        visitorKey = crypto.randomUUID();
        sessionStorage.setItem("pv:visitor", visitorKey);
      }
    } catch {
      // Storage unavailable (private mode, blocked): still record, just
      // without dedupe or a visitor key.
      seenKey = null;
      visitorKey = null;
    }

    void recordProfileView({
      handle,
      eventType: "view",
      referrer: document.referrer || null,
      search: window.location.search || null,
      visitorKey,
    })
      .then(() => {
        try {
          if (seenKey) sessionStorage.setItem(seenKey, "1");
        } catch {
          /* ignore */
        }
      })
      .catch(() => {
        /* measurement never surfaces to the viewer */
      });
  }, [handle]);

  return null;
}
