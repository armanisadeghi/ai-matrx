import { cn } from "@/lib/utils";

/** Pointer on interactive descendants in header/footer action slots (beats header grab). */
export const WINDOW_CHROME_INTERACTIVE =
  "[&_button:not(:disabled)]:cursor-pointer [&_a]:cursor-pointer [&_[role=button]:not([aria-disabled=true])]:cursor-pointer [&_summary]:cursor-pointer [&_label:has(input,[role=checkbox],[role=radio])]:cursor-pointer";

export const WINDOW_CHROME_ACTIONS = cn(
  "flex items-center gap-0.5 shrink-0 text-foreground/80 [&_svg]:text-foreground/80",
  WINDOW_CHROME_INTERACTIVE,
);
