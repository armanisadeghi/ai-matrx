// lib/detail/__tests__/harness.tsx
//
// The test seat for the Detail primitive: stub host ports (every one a jest
// mock, so a test asserts what the core ASKED THE HOST TO DO, which is where
// every one of these defects lived) and a tiny react-dom renderer.
//
// React Testing Library is not installed in this repo — the existing component
// suites (features/print/order/__tests__) drive `react-dom/client` + `act`
// directly, and this follows them rather than adding a dependency to a shared
// checkout.

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  DetailHostProvider,
  type DetailHostPorts,
  type DetailPageShellProps,
} from "../host";
import type { DetailInstanceData, DetailRecordType } from "../types";

// React 19 wants this flag before `act` drives a concurrent root; without it
// every render logs "not configured to support act(...)" and a real warning
// would be lost in the noise.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export const FILE_TYPE: DetailRecordType = {
  type: "file",
  label: "File",
  icon: ({ className }: { className?: string }) => <span className={className} />,
  accent: null,
  entityToken: "file",
  load: null,
  title: (row, seed) =>
    (typeof row?.file_name === "string" ? row.file_name : null) ??
    seed?.name?.trim() ??
    "Untitled File",
  fields: () => [],
};

/**
 * A minimal PAGE shell: the two controls a person leaves the page with (the
 * back chevron and, through the keyboard root, Escape) plus the slots. Enough
 * to assert WHICH port the exit consults — which is where D1 lived, twice.
 */
export function StubPageShell({
  titleNode,
  actions,
  onBack,
  children,
}: DetailPageShellProps) {
  return (
    <div data-stub-page-shell>
      <button type="button" aria-label="Back" onClick={onBack}>
        back
      </button>
      {titleNode}
      {actions}
      {children}
    </div>
  );
}

export type StubPorts = DetailHostPorts & {
  usePresentationSetting: jest.Mock;
  resolvePresentation: jest.Mock;
  warmPresentation: jest.Mock;
  savePresentation: jest.Mock;
  open: jest.Mock;
  close: jest.Mock;
  copyText: jest.Mock;
};

export function makePorts(overrides: Partial<DetailHostPorts> = {}): StubPorts {
  const ports = {
    resolveType: () => FILE_TYPE,
    usePresentationSetting: jest.fn(() => ({ value: "window" as const, error: null })),
    resolvePresentation: jest.fn(async () => "window" as const),
    warmPresentation: jest.fn(),
    savePresentation: jest.fn(async () => ({ ok: true as const })),
    open: jest.fn(),
    close: jest.fn(),
    navigate: {
      pageHref: (ref: { type: string; id: string }) => `/detail/${ref.type}/${ref.id}`,
      toPage: jest.fn(),
      back: jest.fn(),
      canGoBack: jest.fn(() => false),
      toRecordHome: jest.fn(),
    },
    shells: {},
    doors: {
      RecordDoors: ({ id }: { id: string }) => <span data-doors={id} />,
      RefCell: ({ value }: { value: string }) => <span>{value}</span>,
      tokenFromColumnName: () => null,
      isUuidValue: (value: unknown): value is string => typeof value === "string",
    },
    associations: { defaultTokens: [], canAnchor: () => false },
    history: { list: jest.fn(async () => []) },
    notify: { error: jest.fn(), success: jest.fn() },
    copyText: jest.fn(async () => true),
    ...overrides,
  } as unknown as StubPorts;
  return ports;
}

export function instance(over: Partial<DetailInstanceData> = {}): DetailInstanceData {
  return {
    type: "file",
    id: "11111111-2222-3333-4444-555555555555",
    seed: null,
    list: null,
    ...over,
  };
}

export interface Mounted {
  container: HTMLDivElement;
  root: Root;
  unmount: () => void;
}

export function mount(ui: React.ReactElement, ports: DetailHostPorts): Mounted {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<DetailHostProvider ports={ports}>{ui}</DetailHostProvider>);
  });
  return {
    container,
    root,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

/** Click a control by its accessible name. Throws (loudly) when it is absent. */
export function clickByLabel(container: HTMLElement, label: string): void {
  const el = container.querySelector<HTMLElement>(`[aria-label="${label}"]`);
  if (!el) {
    throw new Error(
      `No control labelled "${label}". Present: ` +
        Array.from(container.querySelectorAll("[aria-label]"))
          .map((n) => n.getAttribute("aria-label"))
          .join(" | "),
    );
  }
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}
