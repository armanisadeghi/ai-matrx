/**
 * THE REMOUNT-SAFETY HARNESS — the owner's law (2026-10-02): every screen
 * survives being hidden, shown and remounted with no lost work and no repeated
 * side effects. Data lives in Redux keyed by record; server subscriptions and
 * open/close messages are idempotent; editors are views of the store.
 *
 * One cycle per board item type, mounted exactly as the board mounts a tile
 * (`home/UserBoard.tsx` `TileContent` inside `BoardTile`'s `<Activity>`): the
 * type's `Body` inside its surface `Host` (when it has one), under the real
 * Redux store (`makeStore`), the real chat host and a real Board camera store.
 *
 *   1. mount and let it load            → the baseline ledger
 *   2. the person's action (type, change) and let it settle
 *   3. hide it (`<Activity mode="hidden">`), show it
 *   4. unmount it fully, mount it again (same store, same saved source)
 *
 * After 3 and after 4 the case reads back what the person did (`kept`) and the
 * harness asserts that nothing reached the network (no write, no create, no
 * re-read of data already loaded — a realtime channel closing and reopening is
 * the one allowed traffic, and it must balance), that no window or overlay
 * opened, and that nothing was logged to `console.error`.
 *
 * The break each case names: a mount effect that re-creates, re-launches,
 * re-records "opened", re-fetches into local state or rebuilds an editor from a
 * server copy. Any one of them shows up in the ledger or in `kept`.
 */

import { Activity, act, type ReactNode, useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";
import { makeStore, type AppStore } from "@/lib/redux/store";
import { setUserAuth } from "@/lib/redux/slices/userAuthSlice";
import { setOrganization } from "@/lib/redux/slices/appContextSlice";
import { closeAllOverlays } from "@/lib/redux/slices/overlaySlice";
import { AppProviders } from "./app-providers";
import { SurfaceActivity, createSurfaceCapture } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { FocusHostContext, BoardCameraStoreContext } from "../../engine/react";
import { BoardCameraStore } from "../../engine/camera-store";
import type { NodeSource } from "../../board/document";
import type { BoardItemType } from "../../items/types";
import { ORGANIZATION, PERSON } from "./people";
import { backendCalls, openChannelCount, resetBackend, rpcKind, type BackendCall } from "./fake-backend";
import { navigations } from "./next-navigation";
import { seedPlatform } from "./platform-fixtures";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export { ORGANIZATION, PERSON };

/** Let effects, promises and short timers (debounced saves) run, inside act. */
export async function settle(ms = 50): Promise<void> {
  const until = Date.now() + ms;
  do {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
  } while (Date.now() < until);
}

/**
 * Settle until the network has been quiet for `quietMs` (debounced saves land),
 * at most `maxMs`. A case's own action is allowed to write; this waits for
 * that write so it is never mistaken for a repeat in the next phase.
 */
export async function settleQuiet(quietMs = 1200, maxMs = 12000): Promise<void> {
  const start = Date.now();
  let seen = backendCalls().length;
  let quietSince = Date.now();
  while (Date.now() - start < maxMs) {
    await settle(100);
    const now = backendCalls().length;
    if (now !== seen) {
      seen = now;
      quietSince = Date.now();
    } else if (Date.now() - quietSince >= quietMs) {
      return;
    }
  }
}

export interface TileHandle {
  container: HTMLElement;
  store: AppStore;
  /** The tile's saved source (what the board would persist), updated by `onSource`. */
  source: () => NodeSource;
  hide: () => Promise<void>;
  show: () => Promise<void>;
  remount: () => Promise<void>;
  /** Overlays/windows opened since mount (each transition to open). */
  opened: () => string[];
  unmount: () => void;
}

/** The saved tile (outside React, like the board document): survives a remount. */
function tileRecord(source: NodeSource, title: string) {
  let value = { source, title };
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next: NodeSource, nextTitle?: string) {
      value = { source: next, title: nextTitle ?? value.title };
      for (const l of listeners) l();
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
  };
}

type TileRecord = ReturnType<typeof tileRecord>;

function TileContent({ type, tile, tileId }: { type: BoardItemType; tile: TileRecord; tileId: string }) {
  const { source, title } = useSyncExternalStore(tile.subscribe, tile.get, tile.get);
  const Host = "name" in type.surface ? type.surface.Host : undefined;
  const body = (
    <type.Body tileId={tileId} source={source} title={title} tier="read" interacting onSource={(next, nextTitle) => tile.set(next, nextTitle)} />
  );
  return Host ? <Host source={source}>{body}</Host> : body;
}

function openOverlayKeys(store: AppStore): Set<string> {
  const out = new Set<string>();
  const state = store.getState() as unknown as {
    overlays?: { overlays?: Record<string, Record<string, { isOpen?: boolean }>> };
    windowManager?: { windows?: Record<string, unknown> };
  };
  for (const [id, instances] of Object.entries(state.overlays?.overlays ?? {})) {
    for (const [instance, entry] of Object.entries(instances ?? {})) if (entry?.isOpen) out.add(`overlay:${id}:${instance}`);
  }
  for (const id of Object.keys(state.windowManager?.windows ?? {})) out.add(`window:${id}`);
  return out;
}

/** Mount one tile of `type` showing `source`, the way the board does. */
export async function mountTile(
  type: BoardItemType,
  source: NodeSource,
  options: { title?: string; prepareStore?: (store: AppStore) => void; loadMs?: number; wrap?: (children: ReactNode) => ReactNode } = {},
): Promise<TileHandle> {
  resetBackendFor();
  // What the platform answers for any signed-in screen; the case adds its record.
  seedPlatform();
  const store = makeStore();
  store.dispatch(setUserAuth({ id: PERSON.id, email: PERSON.email, authReady: true, accessToken: "test-access-token" }));
  store.dispatch(setOrganization({ id: ORGANIZATION.id, name: ORGANIZATION.name }));
  options.prepareStore?.(store);
  // What `SyncBootstrap` does after the app hydrates: read the persisted slices
  // once, and wait out the identity resync it starts — a slice written before
  // hydration settles waits on a hold whose expiry is logged as an error.
  const sync = (store as unknown as { _sync: { boot: () => Promise<void>; hydrationSettled: () => boolean } })._sync;
  await act(async () => {
    await sync.boot();
  });
  for (let i = 0; i < 200 && !sync.hydrationSettled(); i++) await settle(25);

  const opened: string[] = [];
  let open = openOverlayKeys(store);
  const stopWatching = store.subscribe(() => {
    const next = openOverlayKeys(store);
    for (const key of next) if (!open.has(key)) opened.push(key);
    open = next;
  });

  const cameraStore = new BoardCameraStore({ x: 0, y: 0, z: 1 });
  cameraStore.setSize({ w: 1600, h: 1000 });
  const capture = createSurfaceCapture();
  const tile = tileRecord(source, options.title ?? type.label);
  const tileId = `tile-${type.key}`;
  let mode: "visible" | "hidden" = "visible";

  const container = document.createElement("div");
  document.body.appendChild(container);

  // The app's providers stay mounted for the whole case, as they do on the
  // board; only the tile below them hides, shows, unmounts and mounts again.
  let present = true;
  const tree = (): ReactNode => (
    <AppProviders store={store}>
      <BoardCameraStoreContext.Provider value={cameraStore}>
        <FocusHostContext.Provider value={null}>
          {(options.wrap ?? ((c: ReactNode) => c))(present ? (
            <Activity mode={mode}>
              <SurfaceActivity active capture={capture}>
                <TileContent type={type} tile={tile} tileId={tileId} />
              </SurfaceActivity>
            </Activity>
          ) : null)}
        </FocusHostContext.Provider>
      </BoardCameraStoreContext.Provider>
    </AppProviders>
  );

  const render = () => act(() => root.render(tree()));
  const root: Root = createRoot(container);
  await render();
  await settle(options.loadMs ?? 300);

  return {
    container,
    store,
    source: () => tile.get().source,
    opened: () => [...opened],
    async hide() {
      mode = "hidden";
      await render();
      await settle(100);
    },
    async show() {
      mode = "visible";
      await render();
      await settle(options.loadMs ?? 300);
    },
    async remount() {
      present = false;
      await render();
      await settle(100);
      present = true;
      mode = "visible";
      await render();
      await settle(options.loadMs ?? 300);
    },
    unmount() {
      act(() => root.unmount());
      stopWatching();
      container.remove();
    },
  };
}

function resetBackendFor() {
  resetBackend(PERSON);
}

/** Network traffic that is not a realtime channel opening or closing. */
export function trafficSince(mark: number): BackendCall[] {
  return backendCalls()
    .slice(mark)
    .filter((c) => c.door !== "channel");
}

export function ledgerMark(): number {
  return backendCalls().length;
}

export function describeCalls(calls: readonly BackendCall[]): string[] {
  return calls.map((c) => `${c.door} ${c.op} ${c.target}`);
}

/** The same, with each call's filters (debugging a case). */
function describeCallsInDetail(calls: readonly BackendCall[]): string[] {
  return calls.map((c) => `${c.door} ${c.op} ${c.target} ${JSON.stringify(c.filters).slice(0, 240)}`);
}

export { openChannelCount };

/** Capture `console.error` for the whole case; the case asserts it stayed empty. */
export function captureConsoleErrors(): { errors: string[]; restore: () => void } {
  const errors: string[] = [];
  const spy = jest.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    // React's test-environment notice about an update landing between two
    // act() scopes (a promise settling while the harness polls) — a property of
    // the harness's clock, never something a person sees.
    if (typeof args[0] === "string" && args[0].startsWith("An update to %s inside a test was not wrapped in act")) return;
    if (process.env.REMOUNT_DEBUG) process.stderr.write(`[console.error] ${require("util").inspect(args, { depth: 6 }).slice(0, 2500)}\n`);
    errors.push(args.map((a) => (a instanceof Error ? a.message : typeof a === "string" ? a : JSON.stringify(a))).join(" ").slice(0, 400));
  });
  return { errors, restore: () => spy.mockRestore() };
}

/** Type into a textarea / input / contenteditable the React way. */
export async function typeInto(el: Element, text: string): Promise<void> {
  await act(async () => {
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
      el.focus();
      setter.call(el, text);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      (el as HTMLElement).textContent = text;
      el.dispatchEvent(new InputEvent("input", { bubbles: true }));
    }
  });
}

/** The rich editor (ProseMirror) a tile renders, with the view a keystroke reaches. */
export interface RichEditorHandle {
  dom: HTMLElement;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  view: any;
}

export function richEditorIn(container: Element, index = 0): RichEditorHandle | null {
  const dom = container.querySelectorAll<HTMLElement>(".ProseMirror")[index];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const view = (dom as any)?.editor?.view ?? (dom as any)?.pmViewDesc?.view ?? null;
  return dom && view ? { dom, view } : null;
}

/** The text a person reads in the rich editor, one paragraph per line. */
export function richTextOf(container: Element, index = 0): string | undefined {
  const rich = richEditorIn(container, index);
  if (!rich) return undefined;
  const lines: string[] = [];
  rich.view.state.doc.forEach((node: { textContent: string }) => lines.push(node.textContent));
  return lines.join("\n");
}

function pressKey(rich: RichEditorHandle, init: KeyboardEventInit): void {
  rich.dom.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
}

/**
 * Type into the rich editor the way a person does: the caret goes to the end of
 * the document, each line is typed through the editor's own text-input path
 * (the view's `handleTextInput`, else a plain insert) and Enter starts the next
 * paragraph through the editor's own keymap.
 */
export async function typeIntoRich(rich: RichEditorHandle, lines: readonly string[]): Promise<void> {
  await act(async () => {
    const { view } = rich;
    rich.dom.focus();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { TextSelection } = require("@tiptap/pm/state") as typeof import("@tiptap/pm/state");
    // The caret goes after the last words (the editor keeps an empty paragraph after them).
    let end = 0;
    view.state.doc.descendants((node: { isTextblock: boolean; content: { size: number } }, pos: number) => {
      if (node.isTextblock && node.content.size > 0) end = pos + 1 + node.content.size;
      return true;
    });
    view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(end), -1)));
    lines.forEach((line, i) => {
      if (i > 0) pressKey(rich, { key: "Enter", code: "Enter" });
      const { from, to } = view.state.selection;
      const handled = view.someProp("handleTextInput", (f: (...a: unknown[]) => boolean) => f(view, from, to, line));
      if (!handled) view.dispatch(view.state.tr.insertText(line, from, to));
    });
  });
}

/** Switch the open note to a view ("Split", "Write", …) with the mode switch, the way a person does. */
export async function showNoteView(tile: { container: Element }, label: string): Promise<void> {
  const button = [...tile.container.querySelectorAll<HTMLElement>("button, [role=radio], [role=tab]")].find(
    (b) => b.getAttribute("aria-label") === label || b.textContent?.trim() === label,
  );
  if (!button) throw new Error(`the note's ${label} view switch never rendered`);
  await act(async () => void button.click());
  await settle(300);
}

export const showSplitView = (tile: { container: Element }) => showNoteView(tile, "Split");

/** Select text in the rich editor by what it says (`text` inside the document), like a person dragging over it. */
export function selectInRich(rich: RichEditorHandle, text: string): [number, number] {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { TextSelection } = require("@tiptap/pm/state") as typeof import("@tiptap/pm/state");
  let range: [number, number] | null = null;
  rich.view.state.doc.descendants((node: { isText?: boolean; text?: string }, pos: number) => {
    if (range || !node.isText || !node.text) return true;
    const i = node.text.indexOf(text);
    if (i >= 0) range = [pos + i, pos + i + text.length];
    return true;
  });
  if (!range) throw new Error(`"${text}" is not in the rich editor`);
  const [from, to] = range as [number, number];
  act(() => {
    rich.view.dispatch(rich.view.state.tr.setSelection(TextSelection.create(rich.view.state.doc, from, to)));
    // A browser tells the page the selection moved; jsdom does not move the DOM selection of an editor.
    document.dispatchEvent(new Event("selectionchange"));
  });
  return [from, to];
}

/** The selection the person left in the rich editor: its range and the text it covers. */
export function richSelectionOf(container: Element, index = 0): { range: [number, number]; text: string } | undefined {
  const rich = richEditorIn(container, index);
  if (!rich) return undefined;
  const { from, to } = rich.view.state.selection;
  return { range: [from, to], text: rich.view.state.doc.textBetween(from, to) };
}

export interface CycleResult {
  /** Traffic caused by hiding and showing. */
  wake: BackendCall[];
  /** Traffic caused by unmounting and mounting again. */
  remount: BackendCall[];
  /** What the case read back after waking / after remounting. */
  keptAfterWake: unknown;
  keptAfterRemount: unknown;
  /** Overlays/windows opened and app navigations during the cycle. */
  opened: string[];
  navigated: string[];
  channelsAfterRemount: number;
  channelsAtBaseline: number;
  errors: string[];
}

export interface CycleSteps {
  title?: string;
  /** Seed the case's fixtures (after the backend is reset for the case). */
  prepare?: () => void;
  prepareStore?: (store: AppStore) => void;
  /** The person's action: type, change a value. */
  act?: (tile: TileHandle) => Promise<void>;
  /** Read back what the person left. */
  kept: (tile: TileHandle) => unknown | Promise<unknown>;
  loadMs?: number;
  /** The feature's save debounce: the action's own write lands before the cycle starts. */
  saveDelayMs?: number;
  /** Providers the board puts around its tiles (the board's conversations). */
  wrap?: (children: ReactNode) => ReactNode;
}

/**
 * The cycle: mount, `act`, hide → show, unmount → mount. Returns what
 * happened; `expectRemountSafe` and `expectQuiet` assert the law on it.
 */
export async function runCycle(type: BoardItemType, source: NodeSource, steps: CycleSteps): Promise<CycleResult> {
  const consoleErrors = captureConsoleErrors();
  let tile: TileHandle | null = null;
  try {
    tile = await mountTile(type, source, {
      title: steps.title,
      loadMs: steps.loadMs,
      wrap: steps.wrap,
      prepareStore: (store) => {
        steps.prepare?.();
        steps.prepareStore?.(store);
      },
    });
    await settleQuiet();
    if (steps.act) {
      await steps.act(tile);
      if (steps.saveDelayMs) await settle(steps.saveDelayMs);
      await settleQuiet();
    }
    // The person closes whatever the tile opened while they worked: waking or
    // remounting must not open it again.
    const t = tile;
    act(() => void t.store.dispatch(closeAllOverlays()));
    const channelsAtBaseline = openChannelCount();
    const openedBefore = tile.opened().length;
    const navigatedBefore = navigations().length;

    const wakeMark = ledgerMark();
    await tile.hide();
    await tile.show();
    const wake = trafficSince(wakeMark);
    const keptAfterWake = await steps.kept(tile);

    const remountMark = ledgerMark();
    await tile.remount();
    const remount = trafficSince(remountMark);
    const keptAfterRemount = await steps.kept(tile);
    if (process.env.REMOUNT_DEBUG) {
      // eslint-disable-next-line no-console
      console.log(
        `[remount-debug] ${type.key}\n` +
          describeCallsInDetail(backendCalls())
            .map((c, i) => `${i === wakeMark ? "--- wake\n" : i === remountMark ? "--- remount\n" : ""}${c}`)
            .join("\n"),
      );
    }

    return {
      wake,
      remount,
      keptAfterWake,
      keptAfterRemount,
      opened: tile.opened().slice(openedBefore),
      navigated: navigations().slice(navigatedBefore),
      channelsAfterRemount: openChannelCount(),
      channelsAtBaseline,
      errors: consoleErrors.errors,
    };
  } finally {
    tile?.unmount();
    consoleErrors.restore();
  }
}

/** A write, a create, a launch, an "opened" recording, an upload — never a plain read. */
export function isSideEffect(call: BackendCall): boolean {
  switch (call.door) {
    case "db":
      return call.op !== "select";
    case "rpc":
      return rpcKind(call.target) !== "read";
    case "fetch":
      return call.op !== "GET";
    case "storage":
      return call.op === "upload" || call.op === "remove";
    default:
      return false;
  }
}

/**
 * THE LAW (core). After waking and after remounting:
 *   - what the person did is still there (`kept`);
 *   - nothing was written, created, launched or recorded again (`isSideEffect`);
 *   - the tile's OWN record was not read again (`ownRecord` — the data the
 *     tile is a view of must come from the store, never a second download);
 *   - no window or overlay opened, nothing navigated, every realtime channel
 *     that closed on the way out was the one that reopened;
 *   - nothing was logged to `console.error`.
 * A type may sleep (`BoardItemType.sleeps`) only while this holds.
 */
export function expectRemountSafe(result: CycleResult, kept: unknown, ownRecord: readonly RegExp[]): void {
  expect({ afterWake: result.keptAfterWake, afterRemount: result.keptAfterRemount }).toEqual({
    afterWake: kept,
    afterRemount: kept,
  });
  const repeated = (calls: BackendCall[]) =>
    describeCalls(calls.filter((c) => isSideEffect(c) || ownRecord.some((r) => r.test(c.target))));
  expect({ wake: repeated(result.wake), remount: repeated(result.remount) }).toEqual({ wake: [], remount: [] });
  expect({ opened: result.opened, navigated: result.navigated }).toEqual({ opened: [], navigated: [] });
  expect(result.channelsAfterRemount).toBeLessThanOrEqual(result.channelsAtBaseline);
  expect(result.errors).toEqual([]);
}

/**
 * THE LAW (quiet). Waking and remounting reach the network not at all: every
 * read the tile needs (permissions, memberships, lists around the record) is
 * in the store, keyed by record, from the first mount.
 */
export function expectQuiet(result: CycleResult): void {
  expect({ wake: describeCalls(result.wake), remount: describeCalls(result.remount) }).toEqual({ wake: [], remount: [] });
}
