"use client";

// features/tasks/components/editor/TaskDescriptionField.tsx
//
// The task description is editable text, so it is THE rich editor with the formatting toolbar
// (Arman, 2026-10-08: "the default for editable text should be the beautiful rich text with the
// toolbar"). Modes, in the order a person meets them: Write (the default — the one visual editor
// notes use), Split (raw on the left, the render on the right), Plain (the agent-wired textarea).
// One slim row carries the mode switch and THE formatting toolbar; the stored value stays markdown.
// The host (`TaskEditorBody`) owns the mode and the refs because the right-click menu and the
// surface scope read them: `withMenu` lets it wrap the body in its menu.

import { useRef, type ReactNode, type Ref, type RefObject } from "react";
import { PenLine, SplitSquareHorizontal, Type } from "lucide-react";
import { SegmentedControl } from "@ai-matrx/design-system/controls";
import RichEditor, { type RichEditorController } from "@ai-matrx/rich-editor/editor/RichEditor";
import { FormatButtons } from "@ai-matrx/rich-editor/format/FormatButtons";
import { formatTargetWithin } from "@ai-matrx/rich-editor/format/format-target";
import { useMeasure } from "@ai-matrx/kit/hooks";
import type { ApplicationScope } from "@ai-matrx/chat/agents/types/scope.types";
import { MatrxSplit } from "@/components/matrx/MatrxSplit";
import { ProTextarea } from "@/components/official/ProTextarea";
import { cn } from "@/lib/utils";

export type TaskDescriptionMode = "write" | "split" | "plain";

export const TASK_DESCRIPTION_MODES = [
  { value: "write", label: "Write", hint: "Edit the formatted description", icon: PenLine },
  { value: "split", label: "Split", hint: "Plain text on the left, the formatted result on the right", icon: SplitSquareHorizontal },
  { value: "plain", label: "Plain", hint: "Quick, unformatted text", icon: Type },
] as const;

/** Below this width of the field's own box, Split shows one pane (two columns would wrap per character). */
const SPLIT_MIN_WIDTH_PX = 480;
/** Below this width the mode switch drops its words (the toolbar needs the room). */
const MODE_LABELS_MIN_WIDTH_PX = 416;

export interface TaskDescriptionFieldProps {
  value: string;
  onChange: (text: string) => void;
  mode: TaskDescriptionMode;
  onModeChange: (mode: TaskDescriptionMode) => void;
  compact?: boolean;
  surfaceName: string;
  getApplicationScope: () => ApplicationScope;
  /** The real textarea in Split and Plain (cursor ops, the right-click menu). */
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  /** The visual editor's controller in Write (caret inserts from the menu). */
  richRef: Ref<RichEditorController>;
  /** Wrap the editing body in the host's right-click menu. */
  withMenu: (body: ReactNode) => ReactNode;
  onSelectionChange: () => void;
}

export function TaskDescriptionField({
  value,
  onChange,
  mode,
  onModeChange,
  compact = false,
  surfaceName,
  getApplicationScope,
  textareaRef,
  richRef,
  withMenu,
  onSelectionChange,
}: TaskDescriptionFieldProps) {
  const [measureRef, { width }] = useMeasure<HTMLDivElement>();
  const frameRef = useRef<HTMLDivElement | null>(null);
  const singlePane = width !== null && width > 0 && width < SPLIT_MIN_WIDTH_PX;
  // A narrow field (a phone) shows the three modes as icons alone.
  const iconsOnly = width !== null && width > 0 && width < MODE_LABELS_MIN_WIDTH_PX;

  return (
    <div
      ref={(node) => {
        frameRef.current = node;
        measureRef(node);
      }}
      data-task-description-field=""
      className={cn(
        "overflow-hidden border border-border/60 bg-card/40",
        compact ? "rounded-none border-x-0" : "rounded-xl",
      )}
    >
      <div className="flex min-h-9 items-center gap-1.5 border-b border-border/60 px-1.5 py-0.5">
        <SegmentedControl
          aria-label="Description view"
          value={mode}
          onValueChange={(next) => onModeChange(next as TaskDescriptionMode)}
          data={TASK_DESCRIPTION_MODES.map(({ value: v, label, hint, icon: Icon }) => ({
            value: v,
            title: hint,
            ariaLabel: label,
            label: iconsOnly ? (
              <Icon className="h-3.5 w-3.5" />
            ) : (
              <>
                <Icon className="h-3.5 w-3.5" />
                <span>{label}</span>
              </>
            ),
          }))}
        />
        <FormatButtons
          size="xs"
          className="min-w-0 flex-1"
          resolve={() => formatTargetWithin(frameRef.current)}
        />
      </div>

      {withMenu(
        <div className={cn("relative w-full", compact ? "h-56" : "h-80")}>
          {mode === "write" && (
            <div className="absolute inset-0 [&_.ProseMirror]:font-sans [&_.ProseMirror]:text-sm! [&_.ProseMirror]:px-3!">
              <RichEditor
                value={value}
                onChange={onChange}
                view="visual"
                chrome="bare"
                hostContextMenu
                controllerRef={richRef}
                placeholder="Description"
                surfaceName={surfaceName}
                sourceFeature="tasks"
                defaultOutlineOpen={false}
                imagePolicy="self"
                className="h-full"
              />
            </div>
          )}
          {mode === "split" && (
            <MatrxSplit
              imagePolicy="self"
              value={value}
              onChange={onChange}
              textareaRef={textareaRef}
              placeholder="Description"
              className="absolute inset-0"
              singlePane={singlePane}
              allowFullScreenEditor={false}
              surfaceName={surfaceName}
              getApplicationScope={getApplicationScope}
            />
          )}
          {mode === "plain" && (
            <ProTextarea
              ref={textareaRef}
              data-kind-source="explicit"
              surfaceName={surfaceName}
              getApplicationScope={getApplicationScope}
              value={value}
              onChange={(e) => {
                onChange(e.target.value);
                onSelectionChange();
              }}
              onSelect={onSelectionChange}
              onKeyUp={onSelectionChange}
              onMouseUp={onSelectionChange}
              placeholder="Description"
              wrapperClassName="absolute inset-0 h-full w-full"
              className="h-full w-full resize-none border-0 bg-transparent text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          )}
        </div>,
      )}
    </div>
  );
}
