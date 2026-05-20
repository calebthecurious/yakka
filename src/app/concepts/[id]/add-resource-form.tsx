"use client";

import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { addResource } from "./actions";

type ResourceType =
  | "course"
  | "book"
  | "video"
  | "article"
  | "project"
  | "paper";

const TYPES: ResourceType[] = [
  "course",
  "book",
  "video",
  "article",
  "project",
  "paper",
];

export function AddResourceForm({ conceptId }: { conceptId: string }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<ResourceType>("article");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const title = (fd.get("title") as string | null)?.trim() ?? "";
    const url = (fd.get("url") as string | null)?.trim() ?? "";
    const notes = (fd.get("notes") as string | null)?.trim() ?? "";

    if (title.length === 0) {
      setError("Title is required.");
      return;
    }
    if (url.length === 0) {
      setError("URL is required.");
      return;
    }
    try {
      new URL(url);
    } catch {
      setError("URL must be a valid http(s) link.");
      return;
    }

    const form = e.currentTarget;
    startTransition(async () => {
      const result = await addResource({
        conceptId,
        title,
        url,
        type,
        notes: notes || undefined,
      });
      if (!result.ok) {
        setError(result.message ?? "Add failed.");
        return;
      }
      form.reset();
      setType("article");
      setOpen(false);
    });
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-foreground h-8 gap-1.5 px-2 text-xs"
        >
          {open ? (
            <X className="size-3.5" />
          ) : (
            <Plus className="size-3.5" />
          )}
          {open ? "Cancel" : "Add your own resource"}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <form
          onSubmit={onSubmit}
          className="border-border/60 bg-card/40 mt-3 flex flex-col gap-3 rounded-md border p-4"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="resource-title" className="text-xs">
              Title
            </Label>
            <Input
              id="resource-title"
              name="title"
              required
              placeholder="e.g. Sutton & Barto, Reinforcement Learning (2nd ed.), ch. 3-6"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="resource-url" className="text-xs">
              URL
            </Label>
            <Input
              id="resource-url"
              name="url"
              type="url"
              required
              placeholder="https://"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="resource-type" className="text-xs">
              Type
            </Label>
            <select
              id="resource-type"
              value={type}
              onChange={(e) => setType(e.target.value as ResourceType)}
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm capitalize"
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="resource-notes" className="text-xs">
              Note (optional)
            </Label>
            <Textarea
              id="resource-notes"
              name="notes"
              rows={2}
              placeholder="Why this resource, what to focus on..."
            />
          </div>

          {error ? (
            <p className="text-destructive text-xs">{error}</p>
          ) : null}

          <div className="flex items-center justify-end gap-2">
            <Button
              type="submit"
              size="sm"
              disabled={isPending}
              className={cn("h-8 text-xs", isPending && "opacity-70")}
            >
              {isPending ? "Adding..." : "Add resource"}
            </Button>
          </div>
        </form>
      </CollapsibleContent>
    </Collapsible>
  );
}
