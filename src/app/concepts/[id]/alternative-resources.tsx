"use client";

import { Children, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

export function AlternativeResources({
  children,
}: {
  children: ReactNode;
}) {
  const items = Children.toArray(children);
  const [open, setOpen] = useState(false);

  if (items.length === 0) return null;

  if (items.length <= 3) {
    return <div className="flex flex-col gap-2">{items}</div>;
  }

  const visible = items.slice(0, 3);
  const hidden = items.slice(3);

  return (
    <div className="flex flex-col gap-2">
      {visible}
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleContent>
          <div className="mt-2 flex flex-col gap-2">{hidden}</div>
        </CollapsibleContent>
        <CollapsibleTrigger className="text-muted-foreground hover:text-foreground mt-1 flex items-center gap-1.5 self-start text-xs transition-colors">
          <ChevronDown
            className={cn("size-3 transition-transform", open && "rotate-180")}
          />
          {open ? "Hide" : `Show ${hidden.length} more`}
        </CollapsibleTrigger>
      </Collapsible>
    </div>
  );
}
