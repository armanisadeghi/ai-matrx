import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../../../..", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

test("ambient dock is transparent outside explicit interactive islands", () => {
  const css = read("styles/shell.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const text = read(
    "features/agents/components/ambient-assistant/ScrollAssistantLauncherImpl.tsx",
  );
  const voice = read(
    "features/agents/components/ambient-assistant/ScrollVoiceAssistantLauncherImpl.tsx",
  );

  assert.match(
    css,
    /\.ambient-assistant-dock\s*\{[^}]*background:\s*transparent;[^}]*pointer-events:\s*none;/s,
  );
  for (const source of [text, voice]) {
    assert.equal(
      (source.match(/ambient-assistant-dock/g) ?? []).length > 0,
      true,
    );
    assert.doesNotMatch(
      source,
      /ambient-assistant-dock\s+pointer-events-auto/,
    );
    assert.match(source, /pointer-events-auto/);
  }
});
