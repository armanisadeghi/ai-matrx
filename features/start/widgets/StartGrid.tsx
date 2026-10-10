"use client";

// features/start/widgets/StartGrid.tsx — the Start page's widget grid: 4 columns on desktop (s = 1,
// m = 2, l = all four), 2 on tablets, 1 on phones. Each widget sits in its fixed slot (frame.tsx). An
// unknown widget type renders a named "unavailable" slot and is never dropped.
import { ArrowDown, ArrowUp, CircleSlash, Settings2, X } from "lucide-react";
import { Button } from "@ai-matrx/design-system/controls";
import { getStartWidgetType } from "./registry";
import { WidgetFrame, WidgetNotice } from "./frame";
import type { StartDoc, StartWidget } from "./types";

export interface StartGridEditing {
  onNudge: (id: string, by: -1 | 1) => void;
  onRemove: (id: string) => void;
  onConfigure: (id: string) => void;
  selectedId: string | null;
}

export function StartGrid({
  doc,
  editing,
  previewing,
  skeleton,
}: {
  doc: StartDoc;
  editing?: StartGridEditing | null;
  previewing?: boolean;
  /** Draw every slot with its frame and no body (first paint before the layout is read). */
  skeleton?: boolean;
}) {
  return (
    // matrx-touch-targets: 44px tap floor for every control in the grid on a phone.
    <div className="matrx-touch-targets grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
      {doc.widgets.map((w, i) => (
        <StartSlot
          key={w.id}
          widget={w}
          first={i === 0}
          last={i === doc.widgets.length - 1}
          editing={editing ?? null}
          previewing={previewing ?? false}
          skeleton={skeleton ?? false}
        />
      ))}
    </div>
  );
}

function StartSlot({
  widget,
  first,
  last,
  editing,
  previewing,
  skeleton,
}: {
  widget: StartWidget;
  first: boolean;
  last: boolean;
  editing: StartGridEditing | null;
  previewing: boolean;
  skeleton: boolean;
}) {
  const type = getStartWidgetType(widget.type);
  const controls = editing ? (
    <>
      <Button variant="quiet" icon={<ArrowUp />} aria-label="Move earlier" disabled={first} onClick={() => editing.onNudge(widget.id, -1)} />
      <Button variant="quiet" icon={<ArrowDown />} aria-label="Move later" disabled={last} onClick={() => editing.onNudge(widget.id, 1)} />
      <Button
        variant="quiet"
        icon={<Settings2 />}
        aria-label="Set up"
        pressed={editing.selectedId === widget.id}
        onClick={() => editing.onConfigure(widget.id)}
      />
      <Button variant="quiet" removes icon={<X />} aria-label="Remove" onClick={() => editing.onRemove(widget.id)} />
    </>
  ) : null;
  if (!type) {
    return (
      <WidgetFrame type={widget.type} size={widget.size} icon={CircleSlash} title="Unavailable" controls={controls} editing={Boolean(editing)}>
        <WidgetNotice>{`"${widget.type}" is not available in this version`}</WidgetNotice>
      </WidgetFrame>
    );
  }
  const Body = type.Body;
  return (
    <WidgetFrame
      type={widget.type}
      size={widget.size}
      config={widget.config}
      icon={type.icon}
      title={type.describe(widget.config)}
      controls={controls}
      editing={Boolean(editing)}
      previewing={previewing}
    >
      {skeleton ? null : <Body config={widget.config} size={widget.size} />}
    </WidgetFrame>
  );
}
