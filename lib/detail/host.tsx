// lib/detail/host.tsx
//
// THE SEAM. Everything this module needs from the app that hosts it arrives
// here as ports — the same shape `@ai-matrx/associations` uses. The core and
// the three presentations import nothing from `features/**`; they ask the host
// for the record-type map, the presentation setting, the shells (window /
// docked / page), the doors, history, navigation and notifications.
//
// Providers NEST AND MERGE: a light provider at boot binds everything but the
// shells (so `useOpenDetail` works anywhere), and each presentation's lazily
// loaded entry binds its own shell right above the presentation — the window
// shell parses the host's window manager and must never sit in a boot bundle.
// A port that is missing when it is needed throws, naming itself.

"use client";

import { createContext, useContext, type ComponentType, type ReactNode } from "react";

import type {
  DetailHistoryEntry,
  DetailInstanceData,
  DetailListContext,
  DetailPresentation,
  DetailRecordType,
  DetailRef,
  DetailSeed,
} from "./types";

/** Props every shell receives; the lib fills the slots, the host owns the chrome. */
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

export interface DetailPresentationSetting {
  /** `undefined` while unresolved; `error` names the failure — never both silent. */
  value: DetailPresentation | undefined;
  error: string | null;
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
      extra?: { seed?: DetailSeed | null; list?: DetailListContext | null },
    ) => void;
    back: () => void;
  };
  shells: DetailShells;
  doors: {
    /** The record's own doors (open / new tab / peek) — sibling of the title. */
    RecordDoors: ComponentType<{ token: string; id: string; name?: string | null }>;
    /** A reference inside the record — never a bare uuid. */
    RefCell: ComponentType<{ value: string; label: string; token: string }>;
    tokenFromColumnName: (column: string) => string | null;
    isUuidValue: (value: unknown) => value is string;
  };
  associations: {
    /** Tokens shown when a registration does not name its own. */
    defaultTokens: readonly string[];
    /** Whether a token may anchor an associations section at all. */
    canAnchor: (token: string) => boolean;
  };
  history: {
    list: (token: string, id: string, signal: AbortSignal) => Promise<DetailHistoryEntry[]>;
  };
  notify: {
    error: (message: string) => void;
    success: (message: string) => void;
  };
  copyText: (text: string) => Promise<boolean>;
}

const DetailHostContext = createContext<Partial<DetailHostPorts> | null>(null);

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
      "[detail] No DetailHostProvider above this component. Mount the host binding " +
        "(features/window-panels/detail/DetailHost.tsx in matrx-frontend, inside app/Providers.tsx) " +
        "around the tree that opens or renders record details.",
    );
  }
  const missing = REQUIRED_PORTS.filter((key) => ports[key] === undefined);
  if (missing.length > 0) {
    throw new Error(
      `[detail] DetailHostProvider is missing the port(s): ${missing.join(", ")}. ` +
        "Bind them in the host's DetailHost.tsx.",
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
        "`resolveType` (features/window-panels/detail/detailTypeBinding.ts) beside its shell.",
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
        `<DetailHostProvider ports={{ shells: { ${which} } }}> (see features/window-panels/detail/shells/).`,
    );
  }
  return shell;
}
