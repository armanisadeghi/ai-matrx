/**
 * `useSensor` OPTIONS ARE MODULE CONSTANTS (see `../sensor-options.ts`).
 *
 * 🚨 /files/all, 2026-10-07: opening one file re-rendered all 50 rows. The page
 * built `useSensor(PointerSensor, { activationConstraint: { distance: 6 } })`
 * inline, so every page render made a new sensor list, changed DndContext's
 * internal context and re-rendered every draggable row — memo cannot stop a
 * context. 36 call sites in 26 files wrote it that way.
 */
import React, { act, memo, useState } from "react";
import { execFileSync } from "node:child_process";
import { createRoot } from "react-dom/client";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useDraggable, useSensor, useSensors } from "@dnd-kit/core";
import { POINTER_ACTIVATION_DISTANCE_6, SORTABLE_KEYBOARD_OPTIONS } from "../sensor-options";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let draws = 0;
const Item = memo(function Item({ id }: { id: string }) {
  draws += 1;
  const drag = useDraggable({ id });
  return <div ref={drag.setNodeRef} {...drag.attributes} {...drag.listeners}>{id}</div>;
});

let rerender: () => void = () => undefined;
function Shell({ inline }: { inline: boolean }) {
  const [, set] = useState(0);
  rerender = () => set((n) => n + 1);
  const sensors = useSensors(
    useSensor(PointerSensor, inline ? { activationConstraint: { distance: 6 } } : POINTER_ACTIVATION_DISTANCE_6),
    useSensor(KeyboardSensor, SORTABLE_KEYBOARD_OPTIONS),
  );
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter}>
      {Array.from({ length: 10 }, (_, i) => <Item key={i} id={`item-${i}`} />)}
    </DndContext>
  );
}

function extraDraws(inline: boolean): number {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<Shell inline={inline} />));
  const before = draws;
  act(() => rerender());
  act(() => rerender());
  const extra = draws - before;
  act(() => root.unmount());
  container.remove();
  return extra;
}

it("with constant options, re-rendering the page redraws no draggable", () => {
  expect(extraDraws(false)).toBe(0);
});

it("an inline options object redraws every draggable on every render (why the constants exist)", () => {
  expect(extraDraws(true)).toBe(20);
});

it("no call site passes useSensor an inline options object", () => {
  let hits = "";
  try {
    hits = execFileSync(
      "git",
      ["grep", "-nE", "useSensor\\([[:space:]]*[A-Za-z]+[[:space:]]*,[[:space:]]*(\\{|$)", "--", "*.ts", "*.tsx", ":!*.test.ts", ":!*.test.tsx", ":!node_modules"],
      { encoding: "utf8" },
    );
  } catch (error) {
    // git grep exits 1 when nothing matches — the passing case.
    if ((error as { status?: number }).status !== 1) throw error;
  }
  expect(hits.trim()).toBe("");
});
