import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CopyButtons } from "./FrameCopyButtons";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const writeText = jest.fn().mockResolvedValue(undefined);
Object.assign(navigator, { clipboard: { writeText } });

describe("FrameCopyButtons", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    writeText.mockClear();
    container = document.body.appendChild(document.createElement("div"));
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("offers each locally executable output and respects stopPropagation", async () => {
    const parentClick = jest.fn();
    await act(async () => {
      root.render(
        <div onClick={parentClick}>
          <CopyButtons
            label="Source"
            human="Human copy"
            agent={{
              kind: "source",
              location: "frame",
              description: "Source",
              data: { id: 1 },
            }}
            json={{ id: 1 }}
            export={{
              items: [
                {
                  id: "text",
                  label: "Text",
                  build: () => ({
                    content: "download",
                    extension: "txt",
                    mime: "text/plain",
                  }),
                },
              ],
            }}
            stopPropagation
          />
        </div>,
      );
    });

    const trigger = container.querySelector(
      '[aria-label="Copy, transform or export Source"]',
    ) as HTMLButtonElement;
    await act(async () => trigger.click());
    expect(parentClick).not.toHaveBeenCalled();
    expect(container.querySelector('[role="menuitem"]')?.textContent).toBe(
      "Copy",
    );
    expect(
      Array.from(container.querySelectorAll('[role="menuitem"]')).map(
        (item) => item.textContent,
      ),
    ).toEqual(["Copy", "Copy for AI", "Copy JSON", "Export Text"]);

    const agentAction = Array.from(
      container.querySelectorAll('[role="menuitem"]'),
    ).find((item) => item.textContent === "Copy for AI") as HTMLButtonElement;
    await act(async () => agentAction.click());
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("<source>"));
    expect(parentClick).not.toHaveBeenCalled();
  });

  it("omits hidden action groups", async () => {
    await act(async () => {
      root.render(
        <CopyButtons
          label="Source"
          human="Human copy"
          agent={{
            kind: "source",
            location: "frame",
            description: "Source",
            data: {},
          }}
          json={{ id: 1 }}
          export={{
            items: [
              {
                id: "text",
                label: "Text",
                build: () => ({
                  content: "download",
                  extension: "txt",
                  mime: "text/plain",
                }),
              },
            ],
          }}
          hide={["copy", "ai", "export"]}
        />,
      );
    });
    const trigger = container.querySelector(
      '[aria-label="Copy, transform or export Source"]',
    ) as HTMLButtonElement;
    await act(async () => trigger.click());
    expect(container.querySelector('[role="menuitem"]')).toBeNull();
  });

  it("copies pre-serialized agent text and requests the markdown flavor", async () => {
    const richCopy = jest.fn().mockResolvedValue(true);
    await act(async () => {
      root.render(
        <CopyButtons
          label="Source"
          human="**Human copy**"
          agent="<task>already serialized</task>"
          contentFlavor="markdown"
          richCopy={richCopy}
        />,
      );
    });
    const trigger = container.querySelector('button[aria-expanded]') as HTMLButtonElement;
    await act(async () => trigger.click());
    const markdownAction = Array.from(container.querySelectorAll('[role="menuitem"]')).find(
      (item) => item.textContent === "Copy markdown",
    ) as HTMLButtonElement;
    await act(async () => markdownAction.click());
    expect(richCopy).toHaveBeenCalledWith("**Human copy**", "markdown");

    await act(async () => trigger.click());
    const agentAction = Array.from(container.querySelectorAll('[role="menuitem"]')).find(
      (item) => item.textContent === "Copy for AI",
    ) as HTMLButtonElement;
    await act(async () => agentAction.click());
    expect(writeText).toHaveBeenCalledWith("<task>already serialized</task>");
  });
});
