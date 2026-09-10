/**
 * features/marketing/content-plan/components/ResearchTopicSelect.tsx — the
 * content plan's research-topic picker.
 *
 * Driven through the REAL CreatablePicker (@ai-matrx/design-system), found by
 * accessible name and visible text. The previous version replaced the picker
 * with a stand-in that only ever called `onCreate`, so the option list the
 * component builds, the no-topic mapping, and the orphan row were never
 * exercised.
 *
 * What the component OWNS: the option list (no research, the loaded topics, a
 * just-created topic the list has not refetched yet, a linked topic the list
 * cannot show); mapping "No research selected" to null; creating through the
 * research service in the SITE's organization and refusing while that org is
 * unknown; selecting and announcing the created topic with a door to it; and
 * screaming when creation fails.
 *
 * Doubles: the research service write, the topics data hook (a network read),
 * and the toast port.
 */
import { act, isValidElement, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Database } from "@/types/database.types";
import {
  rowToResearchTopic,
  type ResearchTopic,
} from "@/features/research/types";
import type { CreateTopicResult } from "@/features/research/service";

const mockCreateTopic = jest.fn<
  Promise<CreateTopicResult>,
  [string, { name: string }]
>();
const mockRefresh = jest.fn<void, []>();
const mockTopics: { data: ResearchTopic[] } = { data: [] };

jest.mock("@/features/research/service", () => ({
  createTopic: (organizationId: string, input: { name: string }) =>
    mockCreateTopic(organizationId, input),
}));
jest.mock("@/features/research/hooks/useResearchState", () => ({
  useAllTopics: () => ({
    data: mockTopics.data,
    isLoading: false,
    error: null,
    refresh: () => mockRefresh(),
  }),
}));
jest.mock("@/lib/toast");

import { toast } from "@/lib/toast";
import { ResearchTopicSelect } from "./ResearchTopicSelect";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
// jsdom does no layout, so it ships neither API; the command list calls both
// when it opens. No-ops are the honest answer for a layout-free document.
if (!("ResizeObserver" in globalThis)) {
  Reflect.set(
    globalThis,
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
}
if (typeof Element.prototype.scrollIntoView !== "function") {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}

const SITE_ORG = "0c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f";
const USER = "a3c1d2e4-5f60-4718-9a2b-3c4d5e6f7081";
const EXISTING_TOPIC = "1f2e3d4c-5b6a-4978-8a9b-0c1d2e3f4a5b";
const NEW_TOPIC = "2a3b4c5d-6e7f-4a8b-9c0d-1e2f3a4b5c6d";
const ORPHAN_TOPIC = "3b4c5d6e-7f8a-4b9c-8d0e-2f3a4b5c6d7e";
const STAMP = "2026-09-10T09:00:00.000Z";

function topic(id: string, name: string): ResearchTopic {
  return rowToResearchTopic({
    agent_config: {},
    analyses_per_keyword: 3,
    autonomy_level: "semi",
    consecutive_refresh_failures: 0,
    created_at: STAMP,
    created_by: USER,
    default_search_params: {},
    default_search_provider: "brave",
    deleted_at: null,
    description: null,
    good_scrape_threshold: 3,
    id,
    intent_brief: null,
    intent_key: null,
    last_refresh_at: null,
    last_refresh_error: null,
    last_refresh_outcome: null,
    last_refresh_trigger: null,
    max_auto_tag_calls: 5,
    max_documents: 50,
    max_keyword_syntheses: 10,
    max_keywords: 20,
    max_tag_consolidations: 3,
    max_topic_syntheses: 3,
    metadata: {},
    name,
    next_refresh_at: null,
    organization_id: SITE_ORG,
    outputs: {},
    refresh_claim_expires_at: null,
    refresh_claim_token: null,
    refresh_interval_hours: null,
    scrapes_per_keyword: 5,
    status: "active",
    tag_suggestions: null,
    template_id: null,
    tone_profile: null,
    updated_at: STAMP,
    updated_by: null,
    version: 1,
    videos_per_keyword: 2,
    visibility: "personal",
  } satisfies Database["research"]["Tables"]["rs_topic"]["Row"]);
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  jest.clearAllMocks();
  mockTopics.data = [topic(EXISTING_TOPIC, "Heat pumps")];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  document.body.innerHTML = "";
});

type SelectProps = ComponentProps<typeof ResearchTopicSelect>;

async function renderSelect(props: Partial<SelectProps> = {}) {
  const onChange = props.onChange ?? jest.fn<void, [string | null]>();
  await act(async () => {
    root.render(
      <ResearchTopicSelect
        value={null}
        organizationId={SITE_ORG}
        {...props}
        onChange={onChange}
      />,
    );
  });
  return onChange;
}

function trigger(): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>(
    'button[aria-label="Research topic"]',
  );
  if (!button) throw new Error('no control named "Research topic"');
  return button;
}

async function openPicker() {
  await act(async () => {
    trigger().click();
  });
}

function optionLabels(): string[] {
  return [...document.querySelectorAll('[role="option"]')].map(
    (option) => option.textContent?.trim() ?? "",
  );
}

async function chooseOption(label: string) {
  const option = [
    ...document.querySelectorAll<HTMLElement>('[role="option"]'),
  ].find((el) => el.textContent?.trim() === label);
  if (!option) {
    throw new Error(`no option "${label}" among ${JSON.stringify(optionLabels())}`);
  }
  await act(async () => {
    option.click();
  });
}

async function typeInSearch(text: string) {
  const input = document.querySelector<HTMLInputElement>(
    'input[placeholder="Search or add a research topic…"]',
  );
  if (!input) throw new Error("the picker's search box is not open");
  const setValue = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  await act(async () => {
    setValue?.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function pressButton(text: string) {
  const button = [...document.querySelectorAll("button")].find(
    (el) => el.textContent?.trim() === text,
  );
  if (!button) throw new Error(`no button "${text}"`);
  await act(async () => {
    button.click();
  });
}

describe("ResearchTopicSelect", () => {
  it("offers no research plus the loaded topics, with no research selected by default", async () => {
    await renderSelect();

    expect(trigger().textContent?.trim()).toBe("No research selected");
    await openPicker();
    expect(optionLabels()).toEqual(["No research selected", "Heat pumps"]);
    expect(
      document.querySelector('a[href="/research/topics"]')?.textContent?.trim(),
    ).toBe("Manage research topics");
  });

  it("reports the chosen topic's id", async () => {
    const onChange = await renderSelect();

    await openPicker();
    await chooseOption("Heat pumps");

    expect(jest.mocked(onChange).mock.calls).toEqual([[EXISTING_TOPIC]]);
  });

  it("reports no topic (null) when 'No research selected' is chosen", async () => {
    const onChange = await renderSelect({ value: EXISTING_TOPIC });

    await openPicker();
    await chooseOption("No research selected");

    expect(jest.mocked(onChange).mock.calls).toEqual([[null]]);
  });

  it("keeps a linked topic the list cannot show visible instead of claiming no research", async () => {
    await renderSelect({ value: ORPHAN_TOPIC });

    expect(trigger().textContent?.trim()).toBe(
      "Linked topic (not in your list)",
    );
  });

  it("creates in the site's organization, selects the new topic, and announces it with a door to it", async () => {
    mockCreateTopic.mockResolvedValue({
      topic: topic(NEW_TOPIC, "Fresh topic"),
      projectLink: { ok: true },
    });
    const onChange = await renderSelect();

    await openPicker();
    await typeInSearch("Fresh topic");
    await pressButton("Create “Fresh topic”");

    expect(mockCreateTopic.mock.calls).toEqual([
      [SITE_ORG, { name: "Fresh topic" }],
    ]);
    expect(jest.mocked(onChange).mock.calls).toEqual([[NEW_TOPIC]]);
    expect(mockRefresh).toHaveBeenCalledTimes(1);

    const successCalls = jest.mocked(toast.success).mock.calls;
    expect(successCalls.map(([message]) => message)).toEqual([
      "Research topic “Fresh topic” created in Research.",
    ]);
    const action = successCalls[0]?.[1]?.action;
    if (!isValidElement(action)) throw new Error("the toast offers no door");
    const doorHost = document.createElement("div");
    const doorRoot = createRoot(doorHost);
    await act(async () => doorRoot.render(action));
    expect(doorHost.querySelector("a")?.getAttribute("href")).toBe(
      `/research/topics/${NEW_TOPIC}`,
    );
    await act(async () => doorRoot.unmount());

    // The parent applies the selection; the list has not refetched yet, yet
    // the new topic shows by name — not as an unknown linked topic.
    await renderSelect({ value: NEW_TOPIC, onChange });
    expect(trigger().textContent?.trim()).toBe("Fresh topic");
  });

  it("refuses to create before the site's organization is known", async () => {
    const onChange = await renderSelect({ organizationId: null });

    await openPicker();
    await typeInSearch("Fresh topic");
    await pressButton("Create “Fresh topic”");

    expect(mockCreateTopic).not.toHaveBeenCalled();
    expect(jest.mocked(onChange)).not.toHaveBeenCalled();
    expect(jest.mocked(toast.error).mock.calls).toEqual([
      [
        "This site's organization is still loading. Try creating the research topic again in a moment.",
      ],
    ]);
  });

  it("screams and selects nothing when creation fails", async () => {
    mockCreateTopic.mockRejectedValue(
      new Error("a topic with this name already exists"),
    );
    const onChange = await renderSelect();

    await openPicker();
    await typeInSearch("Heat pumps 2");
    await pressButton("Create “Heat pumps 2”");

    expect(jest.mocked(onChange)).not.toHaveBeenCalled();
    expect(jest.mocked(toast.error).mock.calls).toEqual([
      [
        "Research topic was not created: a topic with this name already exists",
      ],
    ]);
    expect(jest.mocked(toast.success)).not.toHaveBeenCalled();
  });

  it("refetches the topic list only when the caller bumps refreshKey", async () => {
    const onChange = await renderSelect({ refreshKey: null });
    expect(mockRefresh).not.toHaveBeenCalled();

    await renderSelect({ refreshKey: 1, onChange });

    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });
});
