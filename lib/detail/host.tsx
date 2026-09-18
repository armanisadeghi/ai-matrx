// lib/detail/host.tsx
//
// THE SEAM. Everything this package needs from the app that hosts it arrives
// here as ports — the same shape `@ai-matrx/associations` uses. The core and
// the three presentations import nothing from any host; they ask the host for
// the record-type map, the presentation setting, the shells (window / docked /
// page), the doors, history, navigation and notifications.
//
// Providers NEST AND MERGE: a light provider at boot binds everything but the
// shells (so `useOpenDetail` works anywhere), and each presentation's lazily
// loaded entry binds its own shell right above the presentation — the window
// shell parses the host's window manager and must never sit in a boot bundle.
// A port that is missing when it is needed throws, naming itself.

"use client";

import { createContext, useContext, type Context, type ComponentType, type ReactNode } from "react";

import type {
  DetailHistoryEntry,
  DetailInstanceData,
  DetailListContext,
  DetailPresentation,
  DetailRecordType,
  DetailRef,
  DetailRow,
  DetailSeed,
} from "./types";

/** Props every shell receives; the package fills the slots, the host owns the chrome. */
export interface DetailShellSlots {
  /** Accessible plain-text title (window chrome, drawer title, document title). */
  title: string;
  /** Rich title: icon · name · type chip · the record's doors. */
  titleNode: ReactNode;
  /** Presentation switcher · previous / next · copy id. Compact. */
  actions: ReactNode;
  children: ReactNode;
  onClose: () => void;
}

export interface DetailWindowShellProps extends DetailShellSlots {
  /** `type.id` — the deep-link instance and the window manager's key. */
  instanceKey: string;
  target: DetailRef;
  /**
   * 🚨 NEW-15 — THE LIST TRAVELS INTO THE DEEP LINK. The window's `?panels=`
   * token used to carry the record and the presentation only, so a REFRESH lost
   * the previous / next controls and the counter without a word. The shell puts
   * this into the token the way the page presentation puts it into the query.
   */
  list: DetailListContext | null;
}

export interface DetailDockedShellProps extends DetailShellSlots {
  instanceKey: string;
  target: DetailRef;
}

export interface DetailPageShellProps extends DetailShellSlots {
  target: DetailRef;
  /** Back affordance — the page is the one presentation that left the URL. */
  onBack: () => void;
}

export interface DetailEffectivePresentation {
  /** The effective presentation for this type, `undefined` when unresolved. */
  value: DetailPresentation | undefined;
  /** The per-record-type exception still in effect, from ANY rung. */
  forType: DetailPresentation | undefined;
}

export interface DetailPresentationSetting {
  /** `undefined` while unresolved; `error` names the failure — never both silent. */
  value: DetailPresentation | undefined;
  error: string | null;
  /**
   * The PER-RECORD-TYPE exception in effect for this type, when there is one
   * (`undefined` = this type opens the way the default says). The pane offers
   * "use the default for this type" only then — an offer to remove something
   * that does not exist is a control that does nothing (NEW-2).
   */
  forType?: DetailPresentation | undefined;
}

export interface DetailShells {
  Window?: ComponentType<DetailWindowShellProps>;
  Docked?: ComponentType<DetailDockedShellProps>;
  Page?: ComponentType<DetailPageShellProps>;
}

export interface DetailHostPorts {
  /**
   * The ONE record-type map. `null` = the host has no registration for the
   * type. Bound by each presentation's entry (with its shell), not at boot —
   * the map pulls the registry and the frame into whatever imports it.
   */
  resolveType?: (type: string) => DetailRecordType | null;
  /** React face — the effective `ui.detail.default_presentation` for a type. A hook. */
  usePresentationSetting: (type: string) => DetailPresentationSetting;
  /** Awaited face for click handlers. Rejects with the resolver's error. */
  resolvePresentation: (type: string) => Promise<DetailPresentation>;
  /** Warm the cache so the click path is synchronous. */
  warmPresentation: (type: string) => void;
  /**
   * 🚨 NEW-10 (VERIFY-U-P1-R3) — RE-READ THE LADDER AFTER A WRITE, AND SAY WHAT
   * ANSWERS NOW. Removing your own per-type exception while your ORGANIZATION
   * holds one for the same type succeeded and the pane promised the records
   * "now open the way you normally open records" — they did not; the
   * organization's entry still won on the next open and nothing re-read the
   * ladder. A host binds this to a FRESH ladder read (cache invalidated), never
   * to the cached value the write just made stale. Optional: a host that cannot
   * re-read says so and the pane promises nothing.
   */
  reReadPresentation?: (type: string) => Promise<DetailEffectivePresentation>;
  /**
   * Write the person's presentation setting from inside a detail (the ONE
   * screen that writes `ui.detail.default_presentation`). `forType` non-null
   * writes the PER-RECORD-TYPE override instead of the default.
   *
   * `clear` with a `forType` REMOVES that record type's exception instead of
   * setting one, so an exception set from a record can be taken back from the
   * same place (NEW-2). It is the same map-entry write with the key absent — a
   * host never grows a second writer for it.
   *
   * Optional: a host that can only READ the setting binds nothing and the pane
   * is absent — never a disabled-looking control. A refusal comes back as
   * `{ ok: false, reason }` (the settings ladder's reasons are sentences and
   * the surface renders them), never as a thrown error.
   */
  savePresentation?: (args: {
    presentation: DetailPresentation;
    forType: string | null;
    clear?: boolean;
  }) => Promise<{ ok: true } | { ok: false; reason: string }>;
  /** Open an in-place presentation (window / docked). Page goes through `navigate`. */
  open: (args: {
    presentation: Exclude<DetailPresentation, "page">;
    data: DetailInstanceData;
  }) => void;
  close: (presentation: Exclude<DetailPresentation, "page">) => void;
  navigate: {
    pageHref: (ref: DetailRef, extra?: { list?: DetailListContext | null }) => string;
    toPage: (
      ref: DetailRef,
      extra?: {
        seed?: DetailSeed | null;
        list?: DetailListContext | null;
        /**
         * 🚨 NEW-14 (VERIFY-U-P1-R3) — MOVING INSIDE A LIST REPLACES, NEVER
         * PUSHES. Arrowing to a neighbour on the page pushed a history entry,
         * so twenty records meant twenty Backs and the chevron labelled "Back"
         * returned to the previous RECORD instead of the list. The record whose
         * history entry is being replaced, so the host can carry its "this tab
         * pushed a detail page" answer (`canGoBack`) forward to the record now
         * showing. Absent ⇒ a push, which is what opening a page IS.
         */
        replacing?: DetailRef | null;
      },
    ) => void;
    back: () => void;
    /**
     * 🚨 D1. Whether THIS tab reached the detail page from inside the app, so
     * `back()` lands on a screen the person was actually on. A deep link
     * opened in a fresh tab has NOTHING behind it: `back()` there leaves the
     * tab on `about:blank` with the whole app gone (measured 2026-09-17).
     * A host answers `false` whenever it is not certain.
     */
    canGoBack: (ref: DetailRef) => boolean;
    /**
     * Where the page goes when there is nothing behind it: the record's own
     * home (its canonical route), or the host's home when the type has none.
     * REPLACES the detail page — it is being left, not stacked on.
     */
    toRecordHome: (ref: DetailRef, entityToken: string | null) => void;
  };
  shells: DetailShells;
  doors: {
    /** The record's own doors (open / new tab / peek) — sibling of the title. */
    RecordDoors: ComponentType<{ token: string; id: string; name?: string | null }>;
    /** A reference inside the record — never a bare uuid. */
    /**
     * One id rendered as a door. `name` is the record's own name when the caller
     * has it — a door showing a truncated uuid is half a dead end (chair,
     * 2026-09-18), so a host that can name the record renders the name and keeps
     * the id for the copy control.
     */
    RefCell: ComponentType<{
      value: string;
      label: string;
      token: string;
      name?: string | null;
    }>;
    tokenFromColumnName: (column: string) => string | null;
    isUuidValue: (value: unknown) => value is string;
    /**
     * 🚨 NEW-17 (VERIFY-U-P1-R4) — WHETHER THIS RECORD REALLY OPENS ANYWHERE.
     * `RecordDoors` renders nothing when the token has no route and no peek, so
     * the honest absent state promised "the controls above still open it where it
     * lives" beside a header that carried no such control — for `session`, and for
     * every unregistered type. The body's sentence is derived from this answer,
     * never fixed.
     */
    hasDoor: (token: string, id: string) => boolean;
  };
  associations: {
    /** Tokens shown when a registration does not name its own. */
    defaultTokens: readonly string[];
    /** Whether a token may anchor an associations section at all. */
    canAnchor: (token: string) => boolean;
  };
  history: {
    list: (token: string, id: string, signal: AbortSignal) => Promise<DetailHistoryEntry[]>;
    /**
     * 🚨 NEW-23 (VERIFY-U-P1-R5) — WHO MADE THE CHANGE IS A PERSON, NOT AN ID.
     * Every history row printed a bare 36-character uuid under "Changed by",
     * because no `actor` or `user` token has a door in a host's registry: an
     * identity the UI names that opens nothing and says nothing (the
     * no-dead-ends class). A host binds its ONE existing identity resolver here
     * — never a second one — and the row shows the person's name. Optional: a
     * host that has no directory binds nothing and the row keeps the id under a
     * title that says what it is, which is honest rather than silent.
     *
     * It is given the record's own row too, because the directory a host may
     * legitimately read is usually the owning organization's members and the
     * row is where that organization is named.
     */
    ActorName?: ComponentType<{ actorId: string; row: DetailRow | null }>;
  };
  notify: {
    error: (message: string) => void;
    success: (message: string) => void;
  };
  copyText: (text: string) => Promise<boolean>;
  /**
   * 🚨 THE SAME RECONNECT THE CONNECTOR ROWS SHOW. A synced record whose grant
   * has expired, been revoked or lost a scope offers exactly the repair the
   * connector surface offers, from the record's own health strip, so a person
   * never has to go and find the connections screen. Optional: a host that
   * cannot open a consent flow binds nothing and the strip states the problem
   * without offering a control that would not help (law 4). A producer that
   * answers `onReconnect: null` overrides this for its record — see
   * `DetailSourceHealth.onReconnect`.
   */
  reconnectSource?: (ref: DetailRef, source: string) => void;
  /**
   * Where the developer goes to fix an unregistered or sourceless type — a
   * phrase for the console remedy the core prints once per type per tab (the
   * PERSON sees a plain sentence; the developer sees this). Optional: the
   * default names the `resolveType` port. A host names its own registry, e.g.
   * "the item registry (features/item-presentation/registry.tsx)".
   */
  remedy?: { typeMap: string };
}

// 🚨 MODULE-LEVEL STATE IS BANNED IN A DUAL-BUNDLE PACKAGE — the context lives
// on `globalThis` under a `Symbol.for` slot (the kit `confirm/opener` shape), so
// the ESM and CJS builds, and the /react and /testing entries, all share ONE
// context. Two module instances with two contexts is exactly how a test seat's
// provider stops being visible to the components it mounts.
const CONTEXT_SLOT = Symbol.for("ai-matrx.detail.host-context");
type ContextSlot = { [CONTEXT_SLOT]?: Context<Partial<DetailHostPorts> | null> };
const DetailHostContext: Context<Partial<DetailHostPorts> | null> = ((globalThis as ContextSlot)[
  CONTEXT_SLOT
] ??= createContext<Partial<DetailHostPorts> | null>(null));

/**
 * Binds ports. Nested providers merge over their parent, shells included, so
 * a presentation entry can add only its own shell.
 */
export function DetailHostProvider({
  ports,
  children,
}: {
  ports: Partial<DetailHostPorts>;
  children: ReactNode;
}) {
  const parent = useContext(DetailHostContext);
  const merged: Partial<DetailHostPorts> = {
    ...(parent ?? {}),
    ...ports,
    shells: { ...(parent?.shells ?? {}), ...(ports.shells ?? {}) },
  };
  return <DetailHostContext.Provider value={merged}>{children}</DetailHostContext.Provider>;
}

const REQUIRED_PORTS: (keyof DetailHostPorts)[] = [
  "usePresentationSetting",
  "resolvePresentation",
  "warmPresentation",
  "open",
  "close",
  "navigate",
  "doors",
  "associations",
  "history",
  "notify",
  "copyText",
];

/**
 * The bound ports. Throws with the remedy when a port is missing — a detail
 * that opened with no host would otherwise render every section empty and
 * look finished.
 */
export function useDetailHost(): DetailHostPorts {
  const ports = useContext(DetailHostContext);
  if (!ports) {
    throw new Error(
      "[detail] No DetailHostProvider above this component. Mount the host binding — a " +
        "<DetailHostProvider ports={…}> carrying every required port (README → 'Binding the " +
        "ports') — around the tree that opens or renders record details.",
    );
  }
  const missing = REQUIRED_PORTS.filter((key) => ports[key] === undefined);
  if (missing.length > 0) {
    throw new Error(
      `[detail] DetailHostProvider is missing the port(s): ${missing.join(", ")}. ` +
        "Bind them in the host binding (README → 'Binding the ports').",
    );
  }
  // The context value itself (the provider always sets `shells`), so the
  // object a consumer depends on keeps its identity between renders.
  return ports as DetailHostPorts;
}

/** The record-type map, or an error naming which entry forgot to bind it. */
export function requireResolveType(
  host: DetailHostPorts,
): NonNullable<DetailHostPorts["resolveType"]> {
  if (!host.resolveType) {
    throw new Error(
      "[detail] No resolveType port is bound. A presentation's entry must pass " +
        "`resolveType` (the host's ONE record-type map) beside its shell.",
    );
  }
  return host.resolveType;
}

/** A presentation's shell, or an error naming which entry forgot to bind it. */
export function requireShell<K extends keyof DetailShells>(
  shells: DetailShells,
  which: K,
): NonNullable<DetailShells[K]> {
  const shell = shells[which];
  if (!shell) {
    throw new Error(
      `[detail] No ${which} shell is bound. The ${which} presentation's entry must wrap itself in ` +
        `<DetailHostProvider ports={{ shells: { ${which} } }}> (README → 'The three shells').`,
    );
  }
  return shell;
}
