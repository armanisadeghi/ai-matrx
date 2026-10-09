"use client";

/**
 * ToolBar — the board's tools (Claude Design / FigJam layout): Select, Hand,
 * Text, Frame, Note, Draw, and a Shapes menu (rectangle, oval, arrow, line),
 * each with its key. Screen-space chrome; the active tool lives in the store.
 */

import type { ReactNode } from "react";
import {
  ArrowUpRight,
  ChevronDown,
  Circle,
  Ellipsis,
  Frame,
  Hand,
  Minus,
  MousePointer2,
  Pencil,
  Shapes,
  Square,
  StickyNote,
  Type,
  type LucideIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useActiveTool, useBoardCameraStore } from "../engine/react";
import { SHAPE_TOOLS, type ShapeTool, type BoardTool, TOOL_KEY, TOOL_LABEL } from "../engine/tools";

const ICON: Record<BoardTool, LucideIcon> = {
  select: MousePointer2,
  hand: Hand,
  text: Type,
  frame: Frame,
  note: StickyNote,
  pen: Pencil,
  rect: Square,
  oval: Circle,
  arrow: ArrowUpRight,
  line: Minus,
};

const MAIN_TOOLS: BoardTool[] = ["select", "hand", "text", "frame", "note", "pen"];
/** Tools that stay on the strip at phone width; the rest fold into one "More tools" menu. */
export const PHONE_TOOLS: readonly BoardTool[] = ["select", "hand"];

export function ToolBar({
  leading,
  className,
  tools,
}: {
  leading?: ReactNode;
  className?: string;
  /** A preset's tool list; omitted = every tool. */
  tools?: readonly BoardTool[];
}) {
  const store = useBoardCameraStore();
  const active = useActiveTool();
  const has = (t: BoardTool) => !tools || tools.includes(t);
  const mainTools = MAIN_TOOLS.filter(has);
  const shapeTools = SHAPE_TOOLS.filter(has);
  const shapeActive = (SHAPE_TOOLS as readonly BoardTool[]).includes(active);
  const ShapeIcon = shapeActive ? ICON[active] : Shapes;

  return (
    <div
      data-board-chrome
      role="toolbar"
      aria-label="Board tools"
      className={cn(
        "absolute left-4 top-4 z-30 flex items-center gap-0.5 rounded-lg border border-border bg-card/95 p-1 shadow-md backdrop-blur",
        className,
      )}
    >
      {leading}
      {leading && <span className="mx-1 h-5 w-px bg-border" />}
      {mainTools.map((tool) => (
        <ToolButton
          key={tool}
          tool={tool}
          icon={ICON[tool]}
          active={active === tool}
          onPick={() => store.setTool(tool)}
          className={PHONE_TOOLS.includes(tool) ? undefined : "max-sm:hidden"}
        />
      ))}
      {/* Phone width: the tools that do not fit fold into one menu, so the strip never reaches
          the zoom controls on the right. */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title="More tools"
            aria-label="More tools"
            data-toolbar-overflow
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground sm:hidden",
              !PHONE_TOOLS.includes(active) && "bg-primary/15 text-primary-ink",
            )}
          >
            <Ellipsis className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44" data-board-chrome>
          {[...mainTools.filter((t) => !PHONE_TOOLS.includes(t)), ...shapeTools].map((tool) => {
            const Icon = ICON[tool];
            return (
              <DropdownMenuItem key={tool} onSelect={() => store.setTool(tool)}>
                <Icon className="mr-2 h-4 w-4" />
                {TOOL_LABEL[tool]}
                <DropdownMenuShortcut>{TOOL_KEY[tool]}</DropdownMenuShortcut>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      {shapeTools.length > 0 && (<DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title="Shapes"
            aria-label="Shapes"
            className={cn(
              "flex h-8 items-center gap-0.5 rounded-md px-1.5 text-muted-foreground hover:bg-accent hover:text-foreground max-sm:hidden",
              shapeActive && "bg-primary/15 text-primary-ink",
            )}
          >
            <ShapeIcon className="h-4 w-4" />
            <ChevronDown className="h-3 w-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44" data-board-chrome>
          {shapeTools.map((tool: ShapeTool, i) => {
            const Icon = ICON[tool];
            return (
              <div key={tool}>
                {i === 2 && <DropdownMenuSeparator />}
                <DropdownMenuItem onSelect={() => store.setTool(tool)}>
                  <Icon className="mr-2 h-4 w-4" />
                  {TOOL_LABEL[tool]}
                  <DropdownMenuShortcut>{TOOL_KEY[tool]}</DropdownMenuShortcut>
                </DropdownMenuItem>
              </div>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>)}
    </div>
  );
}

function ToolButton({
  tool,
  icon: Icon,
  active,
  onPick,
  className,
}: {
  className?: string;
  tool: BoardTool;
  icon: LucideIcon;
  active: boolean;
  onPick: () => void;
}) {
  const label = `${TOOL_LABEL[tool]} (${TOOL_KEY[tool]})`;
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onPick}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground",
        active && "bg-primary/15 text-primary-ink hover:bg-primary/20 hover:text-primary-ink",
        className,
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
