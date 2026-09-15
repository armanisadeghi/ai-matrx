/** @jest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { MatrxDataTableProps } from "@ai-matrx/design-system/data-table";
import type { UserSearchCandidate } from "@/features/user-search/types";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let tableProps: MatrxDataTableProps<UserSearchCandidate> | null = null;
const emitUserSearchEvent = jest.fn();

jest.mock("@ai-matrx/design-system/data-table", () => ({
  MatrxDataTable: (props: MatrxDataTableProps<UserSearchCandidate>) => {
    tableProps = props;
    return <div data-testid="user-table" />;
  },
}));

jest.mock("@/features/window-panels/WindowPanel", () => ({
  WindowPanel: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock("@/features/admin/users/components/AdminUserRef", () => ({
  AdminUserRef: () => null,
}));

jest.mock("@/features/user-search/callbacks", () => ({
  emitUserSearchEvent: (...args: unknown[]) => emitUserSearchEvent(...args),
}));

import { UserSearchWindow } from "./UserSearchWindow";

const candidate: UserSearchCandidate = {
  id: "user-1",
  email: "member@example.com",
  displayName: "Member",
  avatarUrl: null,
  phone: null,
  adminLevel: null,
  organizations: [],
  source: "Account directory",
  createdAt: null,
  lastSignInAt: null,
};

describe("UserSearchWindow", () => {
  let host: HTMLDivElement;
  let root: Root;
  const onClose = jest.fn();

  beforeEach(async () => {
    tableProps = null;
    jest.clearAllMocks();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root.render(
        <UserSearchWindow
          isOpen
          onClose={onClose}
          instanceId="picker-1"
          callbackGroupId="callback-1"
          title="Choose a member"
          initialQuery="member@example.com"
          directory="provided"
          candidates={[candidate]}
          excludeUserIds={[]}
        />,
      );
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("selects the user when the visible table row is opened", () => {
    if (!tableProps?.onRowOpen) throw new Error("Row selection is not wired");

    act(() => tableProps?.onRowOpen?.(candidate));

    expect(emitUserSearchEvent).toHaveBeenNthCalledWith(1, "callback-1", {
      type: "selected",
      instanceId: "picker-1",
      user: candidate,
    });
    expect(emitUserSearchEvent).toHaveBeenNthCalledWith(2, "callback-1", {
      type: "window-close",
      instanceId: "picker-1",
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
