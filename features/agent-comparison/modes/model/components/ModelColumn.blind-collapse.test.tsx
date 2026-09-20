/** @jest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ModelColumn as ModelColumnType } from "../types";

let mockState: {
  agentComparison: { blind: { active: boolean; order: string[] } };
};
let boundColumnProps: { hideCreatorPanel?: boolean } | null = null;

jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: typeof mockState) => unknown) =>
    selector(mockState),
}));
jest.mock("../../../shared/BoundColumn", () => ({
  BoundColumn: (props: { hideCreatorPanel?: boolean }) => {
    boundColumnProps = props;
    return null;
  },
}));
jest.mock("../../../shared/BlindColumnHeader", () => ({
  BlindColumnHeader: () => null,
}));
jest.mock("../../../redux/selectors", () => ({
  selectBlindActive: (state: typeof mockState) =>
    state.agentComparison.blind.active,
  selectBlindOrder: (state: typeof mockState) =>
    state.agentComparison.blind.order,
}));
jest.mock("./ModelColumnHeader", () => ({ ModelColumnHeader: () => null }));
jest.mock("../redux/thunks", () => ({
  MODEL_SURFACE_KEY: "agent-comparison-model",
  removeColumnFromModelBattle: jest.fn(),
}));

import { ModelColumn } from "./ModelColumn";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const column: ModelColumnType = {
  columnId: "column-claude",
  conversationId: "conversation-claude",
  label: "Claude Sonnet",
  collapsed: true,
};

describe("ModelColumn collapsed blind label", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    boundColumnProps = null;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("uses the anonymous label for the collapsed text and expansion tooltip before reveal", () => {
    mockState = {
      agentComparison: { blind: { active: true, order: [column.columnId] } },
    };

    act(() =>
      root.render(<ModelColumn column={column} onToggleCollapse={jest.fn()} />),
    );

    expect(host.textContent).toContain("Response A");
    expect(host.textContent).not.toContain("Claude Sonnet");
    expect(host.querySelector("button")?.getAttribute("title")).toBe(
      'Expand "Response A"',
    );
  });

  it("restores the model label and tooltip after blind reveal", () => {
    mockState = {
      agentComparison: { blind: { active: false, order: [column.columnId] } },
    };

    act(() =>
      root.render(<ModelColumn column={column} onToggleCollapse={jest.fn()} />),
    );

    expect(host.textContent).toContain("Claude Sonnet");
    expect(host.querySelector("button")?.getAttribute("title")).toBe(
      'Expand "Claude Sonnet"',
    );
  });

  it("hides creator debug only during an active blind run", () => {
    mockState = {
      agentComparison: { blind: { active: true, order: [column.columnId] } },
    };
    act(() =>
      root.render(
        <ModelColumn
          column={{ ...column, collapsed: false }}
          onToggleCollapse={jest.fn()}
        />,
      ),
    );
    expect(boundColumnProps?.hideCreatorPanel).toBe(true);

    mockState = {
      agentComparison: { blind: { active: false, order: [column.columnId] } },
    };
    act(() =>
      root.render(
        <ModelColumn
          column={{ ...column, collapsed: false }}
          onToggleCollapse={jest.fn()}
        />,
      ),
    );
    expect(boundColumnProps?.hideCreatorPanel).toBe(false);
  });
});
