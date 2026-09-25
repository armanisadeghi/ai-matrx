/**
 * UserPeek — the platform's person peek. A member of the viewer's active
 * organization shows name, role, joined date and an email action; anyone the
 * viewer cannot list reads as "not someone you can see", never leaked.
 *
 * Use case: a kiln studio's lead opens the @-mention of a glaze technician.
 */
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h1>{children}</h1>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div data-footer="">{children}</div>,
}));
const resolveVisiblePerson = jest.fn();
jest.mock("@/features/organizations/people/visiblePeople", () => ({
  resolveVisiblePerson: (id: string) => resolveVisiblePerson(id),
}));

import UserPeek from "../UserPeek";

async function renderPeek(id: string): Promise<HTMLElement> {
  const el = document.createElement("div");
  document.body.appendChild(el);
  await act(async () => {
    createRoot(el).render(<UserPeek id={id} open onClose={() => undefined} />);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return el;
}

beforeEach(() => {
  resolveVisiblePerson.mockReset();
  // Dana shares the viewer's SECOND organization (not the active one).
  resolveVisiblePerson.mockImplementation((id: string) =>
    Promise.resolve(
      id === "u-dana"
        ? { userId: "u-dana", name: "Dana Ruiz", email: "dana@kilnworks.example", avatarUrl: null, role: "member", joinedAt: "2026-03-01T00:00:00Z", organizationId: "org-glaze-coop", organizationName: "Glaze co-op" }
        : null,
    ),
  );
});

it("shows someone sharing ANY organization with the viewer, email as a secondary action, no false Open door", async () => {
  const el = await renderPeek("u-dana");
  expect(resolveVisiblePerson).toHaveBeenCalledWith("u-dana");
  expect(el.textContent).toContain("Glaze co-op");
  expect(el.querySelector("h1")?.textContent).toContain("Dana Ruiz");
  expect(el.querySelector('a[href="mailto:dana@kilnworks.example"]')).not.toBeNull();
  expect(el.textContent).toContain("member");
  expect(el.querySelector("[data-footer]")).toBeNull();
});

it("someone the viewer shares no organization with is not revealed", async () => {
  const el = await renderPeek("u-stranger");
  expect(el.querySelector("[data-user-peek-unavailable]")?.textContent).toMatch(/share an organization/);
  expect(el.textContent).not.toContain("dana@");
});
