/**
 * @ai-matrx/terminal — framework-free core: accessory keys and their byte sequences, the
 * Ctrl / Alt latch, gesture recognition, selection math, viewport math and the terminal look.
 * React lives in `@ai-matrx/terminal/react`; structure in `./styles.css`; default colours in
 * `./tokens.css`.
 */
export { ACCESSORY_KEYS, applyModifiers, controlCode, keySequence } from "./core/keys";
export type { AccessoryKeyDef, AccessoryKeyId, ActiveModifiers, KeyModes } from "./core/keys";
export { DOUBLE_TAP_MS, MODIFIER_OFF, afterKey, isActive, tapModifier } from "./core/modifiers";
export type { ModifierLatch, ModifierState } from "./core/modifiers";
export { FLING_FRICTION, FLING_STOP, LONG_PRESS_MS, createGestureRecognizer, flingStep } from "./core/gesture";
export type { GestureAction, GestureOptions, GestureRecognizer, GestureSample } from "./core/gesture";
export { cellAt, spanBetween, wordBounds } from "./core/selection";
export type { Cell } from "./core/selection";
export { KEYBOARD_MIN_PX, keyboardInset, visibleHeightBelow } from "./core/viewport";
export type { ViewportBox } from "./core/viewport";
export { ACCESSORY_BAR_HEIGHT, TERMINAL_DEFAULTS, TERMINAL_FONT_FAMILY, terminalTheme } from "./core/theme";
export { createLineEditor } from "./core/line-editor";
export type { LineEditor, LineEditorHost } from "./core/line-editor";
