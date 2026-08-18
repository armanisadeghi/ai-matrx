import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { Enrollment } from "../types";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let mockDeepLinkedEnrollment: string | null = null;

jest.mock("next/navigation", () => ({
  useSearchParams: () => ({
    get: (key: string) => (key === "enrollment" ? mockDeepLinkedEnrollment : null),
  }),
}));

const mockEnrollments = [
  {
    id: "first-active",
    status: "active",
    subject_kind: "agent",
    display_name: "First active",
    review_every_n: 10,
  },
] as Enrollment[];

jest.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) =>
    queryKey[1] === "enrollments"
      ? { data: mockEnrollments, isLoading: false, isError: false }
      : { data: null, isLoading: false, isError: false },
}));

jest.mock("./EnrollmentDetailPanel", () => ({
  EnrollmentDetailPanel: ({ enrollmentId }: { enrollmentId: string }) => (
    <div data-testid="detail-enrollment">{enrollmentId}</div>
  ),
}));
jest.mock("./ChangeHistoryPanel", () => ({ ChangeHistoryPanel: () => null }));
jest.mock("./FindingEffectivenessPanel", () => ({
  FindingEffectivenessPanel: () => null,
}));
jest.mock("./EnrollDialog", () => ({ EnrollDialog: () => null }));

import { HindsightPage } from "./HindsightPage";
import { selectEnrollmentId } from "./select-enrollment";

describe("Hindsight enrollment selection", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mockDeepLinkedEnrollment = null;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("uses a newly deep-linked enrollment on the route-change render", () => {
    act(() => root.render(<HindsightPage />));
    expect(container.querySelector('[data-testid="detail-enrollment"]')?.textContent).toBe(
      "first-active",
    );

    mockDeepLinkedEnrollment = "deep-linked";
    act(() => root.render(<HindsightPage />));

    expect(container.querySelector('[data-testid="detail-enrollment"]')?.textContent).toBe(
      "deep-linked",
    );
  });

  it("falls back from the URL to the user's selection and then the active list", () => {
    expect(selectEnrollmentId(null, "selected", "first-active")).toBe("selected");
    expect(selectEnrollmentId(null, null, "first-active")).toBe("first-active");
    expect(selectEnrollmentId(null, null)).toBeNull();
  });
});
