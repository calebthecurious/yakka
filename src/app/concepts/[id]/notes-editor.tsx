"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import "@uiw/react-md-editor/markdown-editor.css";
import "@uiw/react-markdown-preview/markdown.css";
import { cn } from "@/lib/utils";
import { saveLearningSession } from "./actions";

const MDEditor = dynamic(() => import("@uiw/react-md-editor"), { ssr: false });

const DEBOUNCE_MS = 1500;
const MAX_DURATION_MIN = 240;

type SaveState = "idle" | "saving" | "saved" | "error";

export function NotesEditor({
  conceptId,
  initialSessionId,
  initialNotes,
  initialDurationMinutes,
}: {
  conceptId: string;
  initialSessionId: string | null;
  initialNotes: string;
  initialDurationMinutes: number;
}) {
  const [value, setValue] = useState<string>(initialNotes);
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const startedAtRef = useRef<number | null>(null);
  const baseDurationRef = useRef<number>(initialDurationMinutes);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const valueRef = useRef<string>(initialNotes);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  function scheduleSave(next: string) {
    if (startedAtRef.current === null && next !== initialNotes) {
      startedAtRef.current = Date.now();
    }
    setValue(next);
    setSaveState("saving");

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void doSave();
    }, DEBOUNCE_MS);
  }

  async function doSave() {
    const notesMarkdown = valueRef.current;
    const elapsedMin =
      startedAtRef.current !== null
        ? (Date.now() - startedAtRef.current) / 60000
        : 0;
    const durationMinutes = Math.min(
      MAX_DURATION_MIN,
      Math.round(baseDurationRef.current + elapsedMin),
    );

    const result = await saveLearningSession({
      conceptId,
      sessionId: sessionId ?? undefined,
      notesMarkdown,
      durationMinutes,
    });

    if (!result.ok) {
      setSaveState("error");
      setSavedMessage(result.message ?? "Save failed.");
      return;
    }

    if (result.sessionId && result.sessionId !== sessionId) {
      setSessionId(result.sessionId);
    }
    setSaveState("saved");
    setSavedMessage(
      new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    );
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div className="flex flex-col gap-2" data-color-mode="dark">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <label className="text-sm font-medium">Your notes</label>
          <span className="text-muted-foreground text-xs">
            Your own reflections — separate from the AI study briefs above.
          </span>
        </div>
        <span
          className={cn(
            "text-xs",
            saveState === "saving" && "text-muted-foreground",
            saveState === "saved" && "text-emerald-300",
            saveState === "error" && "text-destructive",
            saveState === "idle" && "text-muted-foreground",
          )}
        >
          {saveState === "saving" && "Saving..."}
          {saveState === "saved" && savedMessage && `Saved at ${savedMessage}`}
          {saveState === "error" && (savedMessage ?? "Save failed.")}
          {saveState === "idle" && initialNotes.length > 0 && "Loaded"}
        </span>
      </div>
      <MDEditor
        value={value}
        onChange={(v) => scheduleSave(v ?? "")}
        preview="edit"
        height={320}
        visibleDragbar={false}
      />
    </div>
  );
}
