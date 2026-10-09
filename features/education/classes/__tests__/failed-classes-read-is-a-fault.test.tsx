/**
 * A FAILED READ IS NEVER "NOT FOUND / ASK FOR ACCESS" (2026-10-03).
 *
 * Live (independent check): the joined-classes read (`edu_my_classes`) answered
 * 500. A class reached by its slug could then not be resolved, and the page
 * told the person "We couldn't find this item… Ask for access" — a database
 * fault dressed as a permission. The SUT is the real `ClassHubView`; its data
 * hooks are the seams. The real AccessGate is replaced by a probe that reports
 * the error it was handed and renders the page's fault display when that error
 * is a fault — exactly the AccessGate contract (`renderFault`).
 */
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { classifyDataError } from "@/features/access-gate/classifyDataError";
import { ClassHubView } from "../components/ClassHubView";

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));
jest.mock("@/features/education/components/EducationToolHeader", () => ({
  EducationToolHeader: () => null,
}));
jest.mock("@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext", () => ({
  SurfaceRuntimeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("@ai-matrx/design-system", () => ({
  ...jest.requireActual("@ai-matrx/design-system"),
  ErrorNotice: ({ title, message }: { title?: string; message?: string }) => (
    <div role="alert">
      {title} — {message}
    </div>
  ),
}));
jest.mock("@/features/access-gate/components/AccessGate", () => ({
  AccessGate: ({ error, renderFault }: { error?: unknown; renderFault?: (e: unknown) => React.ReactNode }) =>
    error && classifyDataError(error) === "fault" && renderFault ? (
      <>{renderFault(error)}</>
    ) : (
      <p>We couldn&apos;t find this item</p>
    ),
}));
jest.mock("../hooks/useClasses", () => ({
  useClasses: () => ({ classes: [], archived: [], loading: false, updateClass: jest.fn() }),
}));
jest.mock("../hooks/useClassAccess", () => ({
  useClassAccess: () => ({ state: null, loading: false, error: null, refresh: jest.fn() }),
}));
const myClasses = { joined: [] as unknown[], loading: false, error: null as string | null, failure: null as unknown, refresh: jest.fn() };
jest.mock("../hooks/useMyClasses", () => ({ useMyClasses: () => myClasses }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function render(node: React.ReactNode): HTMLElement {
  const host = document.createElement("div");
  document.body.replaceChildren(host);
  act(() => createRoot(host).render(node));
  return host;
}

describe("a class reached by its slug", () => {
  it("says the classes read failed — never 'not found' — when edu_my_classes broke", () => {
    myClasses.failure = { code: "57014", message: "canceling statement due to statement timeout", status: 500 };
    myClasses.error = "Could not load your classes.";
    const host = render(<ClassHubView classParam="organic-chem-joined" />);
    expect(host.textContent).not.toMatch(/couldn't find this item/i);
    const alert = host.querySelector('[role="alert"]');
    expect(alert?.textContent).toMatch(/Couldn't open this class/);
    expect(alert?.textContent).not.toMatch(/57014|canceling statement/);
  });

  it("still asks the access question when every read succeeded", () => {
    myClasses.failure = null;
    myClasses.error = null;
    const host = render(<ClassHubView classParam="organic-chem-joined" />);
    expect(host.textContent).toMatch(/couldn't find this item/i);
  });
});
