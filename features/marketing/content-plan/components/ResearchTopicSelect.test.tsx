import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { ResearchTopicSelect } from "./ResearchTopicSelect";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mockCreateTopic = jest.fn();
const mockRefresh = jest.fn();
const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();
const mockToastDoor = jest.fn((..._args: unknown[]) => <span>Open topic</span>);

jest.mock("@/features/research/service", () => ({
  createTopic: (...args: unknown[]) => mockCreateTopic(...args),
}));

jest.mock("@/features/research/hooks/useResearchState", () => ({
  useAllTopics: () => ({
    data: [{ id: "topic-existing", name: "Existing topic" }],
    isLoading: false,
    error: null,
    refresh: mockRefresh,
  }),
}));

jest.mock("@/lib/toast", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

jest.mock("@/components/official/entity-ref/toastDoor", () => ({
  toastDoor: (...args: unknown[]) => mockToastDoor(...args),
}));

jest.mock("@/components/ui/creatable-picker", () => ({
  CreatablePicker: (props: {
    onCreate: (name: string) => Promise<string | null>;
    onSelect: (value: string) => void;
    manageAction: { label: string; href: string };
    options: Array<{ value: string; label: string }>;
  }) => (
    <div>
      <button
        type="button"
        onClick={() => {
          void props.onCreate("Fresh topic").then((id) => {
            if (id) props.onSelect(id);
          });
        }}
      >
        Create topic
      </button>
      <a href={props.manageAction.href}>{props.manageAction.label}</a>
      {props.options.map((option) => (
        <span key={option.value}>{option.label}</span>
      ))}
    </div>
  ),
}));

describe("ResearchTopicSelect", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    jest.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("creates through the research service and selects the new topic immediately", async () => {
    const onChange = jest.fn();
    mockCreateTopic.mockResolvedValue({
      topic: { id: "topic-new", name: "Fresh topic" },
      projectLink: { ok: true },
    });

    await act(async () => {
      root.render(
        <ResearchTopicSelect
          value={null}
          onChange={onChange}
          organizationId="site-org-1"
        />,
      );
    });
    expect(container.textContent).toContain("No research selected");
    expect(container.textContent).toContain("Existing topic");
    expect(
      container.querySelector('a[href="/research/topics"]'),
    ).not.toBeNull();

    await act(async () => {
      container.querySelector<HTMLButtonElement>("button")?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockCreateTopic).toHaveBeenCalledWith("site-org-1", {
      name: "Fresh topic",
    });
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("topic-new");
    expect(mockToastDoor).toHaveBeenCalledWith("research_topic", "topic-new");
    expect(mockToastSuccess).toHaveBeenCalledWith(
      "Research topic “Fresh topic” created in Research.",
      expect.objectContaining({ action: expect.anything() }),
    );
  });

  it("does not create before the site's organization is available", async () => {
    const onChange = jest.fn();
    await act(async () => {
      root.render(
        <ResearchTopicSelect
          value={null}
          onChange={onChange}
          organizationId={null}
        />,
      );
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>("button")?.click();
      await Promise.resolve();
    });

    expect(mockCreateTopic).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
    expect(mockToastError).toHaveBeenCalledWith(
      "This site's organization is still loading. Try creating the research topic again in a moment.",
    );
  });
});
