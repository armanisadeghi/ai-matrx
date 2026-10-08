/**
 * The box's "…" menu reads the box's own text aloud through THE one TTS entry
 * point (speak → the playback queue) — never an AI summary, never a second path.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { createRoot } from "react-dom/client";

import { ReadAloudMenuRow } from "./ReadAloudMenuRow";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const speak = jest.fn((_req: { text: string; label?: string }) => ({ id: "u1" }));
jest.mock("@/features/audio/service/speak", () => ({
  speak: (req: { text: string; label?: string }) => speak(req),
}));
const primeAudioOutput = jest.fn();
jest.mock("@/features/audio/unlock", () => ({ primeAudioOutput: () => primeAudioOutput() }));
jest.mock("@/lib/toast", () => ({ toast: { error: jest.fn() } }));

async function mount(text: string, onDone = jest.fn()) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<ReadAloudMenuRow text={text} onDone={onDone} />);
  });
  return { container, root, onDone };
}

it("offers Read aloud and plays the box's own text", async () => {
  const { container, root, onDone } = await mount("Dear Maria, thank you for coming in.");
  const button = [...container.querySelectorAll("button")].find(
    (b) => b.textContent === "Read aloud",
  );
  expect(button).toBeDefined();
  await act(async () => {
    button!.click();
  });
  expect(primeAudioOutput).toHaveBeenCalled();
  expect(onDone).toHaveBeenCalled();
  expect(speak).toHaveBeenCalledWith({
    text: "Dear Maria, thank you for coming in.",
    label: "Read aloud",
  });
  await act(async () => root.unmount());
});

it("is absent when the box is empty", async () => {
  const { container, root } = await mount("   ");
  expect(container.textContent).not.toContain("Read aloud");
  await act(async () => root.unmount());
});

it("ProInput's hand-built menu carries the row first", () => {
  const src = readFileSync(join(__dirname, "ProInput.tsx"), "utf8");
  const menuStart = src.indexOf('menuMode === "menu" ? (');
  expect(menuStart).toBeGreaterThan(-1);
  const firstRow = src.indexOf("<ReadAloudMenuRow", menuStart);
  const voiceRow = src.indexOf("{voiceInMenu && (", menuStart);
  expect(firstRow).toBeGreaterThan(menuStart);
  expect(firstRow).toBeLessThan(voiceRow);
});
