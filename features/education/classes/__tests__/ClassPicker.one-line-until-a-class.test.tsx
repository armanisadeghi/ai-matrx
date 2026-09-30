/**
 * FORCING TEST: the deck page's class picker is ONE LINE until there is a class
 * to pick.
 *
 * 2026-09-27: the flashcards deck page (/education/flashcards/<id>) showed an
 * expanded "CLASSES / Class / None" dropdown under the title where the one-line
 * "Add a class to organize this" used to be. The Class scope type outlives its
 * classes (created with the first class, kept when they are deleted or
 * archived), and the picker gated the one-liner on "no type" only, so a type
 * with no active classes rendered a dropdown whose only choice was "None".
 *
 * Expected strings are typed by hand.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { ClassPicker } from "../components/ClassPicker";

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mockUseClasses = jest.fn();
const taggerProps: Record<string, unknown>[] = [];
jest.mock("@/features/education/classes/hooks/useClasses", () => ({
  useClasses: () => mockUseClasses(),
}));
jest.mock("@/features/scopes/hooks/useScopeTree", () => ({
  useScopeTree: () => ({ organizations: [], refresh: jest.fn() }),
}));
// The canonical tagger has its own suites; here it only has to be visibly present.
jest.mock("@/features/scopes/components/entity-context/EntityScopeTagger", () => ({
  EntityScopeTagger: (props: unknown) => {
    taggerProps.push(props as Record<string, unknown>);
    return <div data-testid="tagger">tagger</div>;
  },
}));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const ONE_LINER = "Add a class to organize this";

function state(over: Partial<{ classTypeIds: string[]; classes: unknown[]; error: unknown }>) {
  return { classTypeIds: [], classes: [], error: null, orgId: "org-1", ...over };
}

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  mockUseClasses.mockReset();
});

function render() {
  act(() => root.render(<ClassPicker entityType="fc_set" entityId="set-1" />));
}

it("shows the one-liner when there is no Class type", () => {
  mockUseClasses.mockReturnValue(state({}));
  render();
  expect(host.textContent).toContain(ONE_LINER);
  expect(host.querySelector('[data-testid="tagger"]')).toBeNull();
});

it("shows the one-liner when the Class type exists but has no active classes", () => {
  mockUseClasses.mockReturnValue(state({ classTypeIds: ["type-1"], classes: [] }));
  render();
  expect(host.textContent).toContain(ONE_LINER);
  expect(host.querySelector("a")?.getAttribute("href")).toBe("/education/classes");
  expect(host.querySelector('[data-testid="tagger"]')).toBeNull();
});

it("shows the class tagger once there is a class to pick", () => {
  mockUseClasses.mockReturnValue(
    state({ classTypeIds: ["type-1"], classes: [{ id: "c1", name: "Biology 101" }] }),
  );
  render();
  expect(host.querySelector('[data-testid="tagger"]')).not.toBeNull();
  expect(host.textContent).not.toContain(ONE_LINER);
});

it("hands a failed tree read to the tagger (which shows the failure) instead of hiding it", () => {
  mockUseClasses.mockReturnValue(
    state({ classTypeIds: ["type-1"], classes: [], error: new Error("read failed") }),
  );
  render();
  expect(host.querySelector('[data-testid="tagger"]')).not.toBeNull();
});

it("offers the classes of EVERY organization and tags in the record's own org, not the active one", () => {
  taggerProps.length = 0;
  mockUseClasses.mockReturnValue({
    ...state({ classes: [{ id: "c1", name: "Biology 101" }] }),
    classTypeIds: ["type-a", "type-b"],
    orgId: "active-org",
  });
  act(() =>
    root.render(<ClassPicker entityType="fc_set" entityId="set-1" organizationId="record-org" />),
  );
  const props = taggerProps.at(-1)!;
  expect(props.scopeTypeAllowlist).toEqual(["type-a", "type-b"]);
  expect(props.organizationId).toBe("record-org");
});
