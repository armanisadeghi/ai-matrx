/**
 * 🚨 `useSensor` OPTIONS ARE MODULE CONSTANTS — never an object literal at the call site.
 *
 * dnd-kit keys a sensor on the IDENTITY of its options. An inline
 * options object handed to `useSensor` (a distance constraint written at the call site) builds a
 * new sensor list on every render, which changes `DndContext`'s internal
 * context, which re-renders EVERY `useDraggable` / `useSortable` / `useDroppable`
 * item under it — `memo` cannot stop a context. Measured on /files/all
 * (2026-10-07): opening one file re-rendered all 50 rows. (The React Compiler
 * would cache the literal, but it skips some components; a constant holds
 * everywhere.)
 *
 * Need a distance that is not here? Add a constant beside these.
 * Guard: `lib/dnd/__tests__/sensor-options-are-constants.test.ts`.
 */
import type { KeyboardSensorOptions, PointerSensorOptions } from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";

export const POINTER_ACTIVATION_DISTANCE_4: PointerSensorOptions = { activationConstraint: { distance: 4 } };
export const POINTER_ACTIVATION_DISTANCE_5: PointerSensorOptions = { activationConstraint: { distance: 5 } };
export const POINTER_ACTIVATION_DISTANCE_6: PointerSensorOptions = { activationConstraint: { distance: 6 } };
export const POINTER_ACTIVATION_DISTANCE_8: PointerSensorOptions = { activationConstraint: { distance: 8 } };

/** Arrow keys move a sortable item one slot. */
export const SORTABLE_KEYBOARD_OPTIONS: KeyboardSensorOptions = { coordinateGetter: sortableKeyboardCoordinates };
