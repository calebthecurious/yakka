import type { ElementType, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The app's three content widths. Pick by content type:
 *  - `prose`   (max-w-prose, ~65ch) — narrative/long-form text columns.
 *  - `content` (max-w-5xl, ~1024px) — standard pages: text + cards, forms, profile.
 *  - `wide`    (max-w-7xl, ~1280px) — dashboards: syllabi list, tree, gap report.
 *
 * Caps at ~1280px so layouts don't stretch across ultrawide monitors. Horizontal
 * padding (px-4 sm:px-6 lg:px-8) keeps content off the screen edges on small windows.
 * Pass `className` for per-page flex/grid + gap (e.g. "flex flex-col gap-8").
 */
type ContainerWidth = "prose" | "content" | "wide";

const WIDTH_CLASS: Record<ContainerWidth, string> = {
  prose: "max-w-prose",
  content: "max-w-5xl",
  wide: "max-w-7xl",
};

export function PageContainer({
  width = "content",
  as: Comp = "main",
  className,
  children,
}: {
  width?: ContainerWidth;
  as?: ElementType;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Comp
      className={cn(
        "mx-auto w-full px-4 py-8 sm:px-6 sm:py-12 lg:px-8",
        WIDTH_CLASS[width],
        className,
      )}
    >
      {children}
    </Comp>
  );
}
