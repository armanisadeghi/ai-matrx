/**
 * The seek contract of the ONE chapter renderer (Agent Manifest Campaign,
 * Ruling B — "get the podcast chapters wired").
 *
 * These assertions are the whole point of the wiring: a chapter row must hand
 * its host the ABSOLUTE OFFSET IN SECONDS that its `MM:SS` / `HH:MM:SS` label
 * describes. Everything downstream — `PodcastEpisodePage`'s player handle, the
 * studio run view's player — is a one-line forward of this number, so a
 * regression here is the difference between "jump to 02:10" and a wrong seek
 * nobody notices until a listener complains.
 */

import { act } from "react";
import { createRoot } from "react-dom/client";
import MediaChaptersBlock from "./MediaChaptersBlock";

const CHAPTERS = [
  { start_hint: "00:00", title: "Introduction to Sky Colors", summary: "" },
  { start_hint: "02:10", title: "Why Not Violet", summary: "Lower violet emission." },
  { start_hint: "1:02:03", title: "The long tail", summary: "" },
  // Unparseable offset — must render, but never as a seek button.
  { start_hint: "later", title: "Bad offset", summary: "" },
];

function mount(onSeek?: (seconds: number) => void) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() =>
    root.render(
      <MediaChaptersBlock
        serverData={{ chapters: CHAPTERS, isComplete: true }}
        onSeek={onSeek}
      />,
    ),
  );
  return { container, root };
}

describe("MediaChaptersBlock seek wiring", () => {
  it("hands the host absolute seconds for the clicked chapter", () => {
    const onSeek = jest.fn();
    const { container } = mount(onSeek);

    const buttons = Array.from(container.querySelectorAll("button"));
    // Three parseable chapters become buttons; the bad offset stays text.
    expect(buttons).toHaveLength(3);

    act(() => {
      buttons[1].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onSeek).toHaveBeenCalledTimes(1);
    expect(onSeek.mock.calls[0][0]).toBe(130); // 02:10
    expect(onSeek.mock.calls[0][1]).toMatchObject({ title: "Why Not Violet" });

    act(() => {
      buttons[2].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onSeek.mock.calls[1][0]).toBe(3723); // 1:02:03

    act(() => {
      buttons[0].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onSeek.mock.calls[2][0]).toBe(0); // 00:00
  });

  it("renders every chapter as static text when no host owns a player", () => {
    // Chat has nothing to seek — the same component, zero buttons.
    const { container } = mount(undefined);
    expect(container.querySelectorAll("button")).toHaveLength(0);
    expect(container.querySelectorAll("li")).toHaveLength(4);
    expect(container.textContent).toContain("Why Not Violet");
  });
});
