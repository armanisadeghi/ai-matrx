import type { NoteOutlineItem } from "@/features/notes/utils/noteOutline";
import { cn } from "@/lib/utils";

interface OutlineHeaderProps {
  title: NoteOutlineItem | null;
  active: boolean;
  onJump: (headingIndex: number) => void;
}

export function OutlineHeader({ title, active, onJump }: OutlineHeaderProps) {
  if (!title) {
    return <p className="px-1 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">On this page</p>;
  }

  return <button type="button" onClick={() => onJump(title.headingIndex)} title={title.text} className={cn("block w-full overflow-hidden whitespace-nowrap border-l-2 px-1 py-1 text-left text-xs font-semibold [mask-image:linear-gradient(to_right,black_calc(100%_-_12px),transparent)] hover:bg-accent", active ? "border-primary bg-primary/10 text-primary" : "border-transparent text-foreground")}>{title.text}</button>;
}
