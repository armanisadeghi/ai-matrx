/** @jest-environment jsdom */

/**
 * THE GUARD: a test case written from a media Library says where its material
 * came from.
 *
 * `source = 'library'` is a value this list had never seen, and the failure it
 * invites is silent — the row renders, the input renders, and the only thing
 * missing is the one fact that makes the sample meaningful (whose channel it
 * is). Nothing throws, so nothing else catches it. This renders the real
 * component over a real-shaped `metadata.media_catalog` block and asserts the
 * Library's name and the item's url are on screen.
 */

import { act, type AnchorHTMLAttributes, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SampleOriginLine } from "../SampleOriginLine";
import { libraryReadiness } from "../LoadFromLibraryDialog";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({
    children,
    href,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    children: ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const librarySample = {
  source: "library",
  metadata: {
    media_catalog: {
      key: "use_as_agent_test_cases",
      action: "use_as_agent_test_cases",
      library_id: "5f2b7c3a-0000-4000-8000-000000000001",
      library_name: "All Green Recycling — channel",
      adapter: "youtube",
      job_id: "5f2b7c3a-0000-4000-8000-000000000002",
      items: [
        {
          source_row_id: "5f2b7c3a-0000-4000-8000-000000000003",
          external_id: "dQw4w9WgXcQ",
          title: "What actually happens to your electronics",
          url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          published_at: "2026-08-01T00:00:00Z",
          transcript_id: "5f2b7c3a-0000-4000-8000-000000000004",
          segment_count: 412,
        },
      ],
      bindings: [],
    },
  },
};

let container: HTMLDivElement;
let root: Root;

function render(node: ReactNode) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(node);
  });
}

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

describe("a test case from a Library says so", () => {
  it("names the Library and links the single item it was made from", () => {
    render(<SampleOriginLine sample={librarySample} />);

    expect(container.textContent).toContain("All Green Recycling — channel");
    expect(container.textContent).toContain(
      "What actually happens to your electronics",
    );

    const hrefs = Array.from(container.querySelectorAll("a")).map(
      (anchor) => anchor.getAttribute("href"),
    );
    expect(hrefs).toContain("/libraries/5f2b7c3a-0000-4000-8000-000000000001");
    expect(hrefs).toContain("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(container.textContent).not.toContain("undefined");
  });

  it("still names the origin when the provenance block is missing", () => {
    render(<SampleOriginLine sample={{ source: "library", metadata: {} }} />);
    expect(container.textContent).toContain("From");
    expect(container.textContent).toContain("a Library");
    expect(container.textContent).not.toContain("undefined");
  });

  it("adds nothing to samples from any other source", () => {
    render(
      <SampleOriginLine
        sample={{ source: "borrowed", metadata: { media_catalog: {} } }}
      />,
    );
    expect(container.textContent).toBe("");
  });
});

describe("a Library with no transcribed items refuses, in words", () => {
  it("names the remedy instead of offering a dead button", () => {
    const verdict = libraryReadiness({
      libraryName: "All Green Recycling — channel",
      readyCount: 0,
      totalCount: 37,
    });
    expect(verdict.canStart).toBe(false);
    expect(verdict.sentence).toContain("Transcribe them in the Library first");
    expect(verdict.sentence).toContain("All Green Recycling — channel");
  });

  it("lets a Library with transcripts through", () => {
    expect(
      libraryReadiness({ libraryName: "X", readyCount: 4, totalCount: 37 }),
    ).toEqual({ canStart: true, sentence: null });
  });
});
