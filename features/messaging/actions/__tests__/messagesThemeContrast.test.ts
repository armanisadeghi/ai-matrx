/**
 * Regression guard for Messages surfaces nested inside an outgoing bubble.
 *
 * Outgoing bubbles inherit white text. A nested light card without its own
 * foreground therefore rendered white-on-white, while the old cyan outgoing
 * bubble also missed normal-text contrast. These checks keep each surface's
 * background and foreground paired and verify the real Messages palette.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const messagesCss = readFileSync(
  path.join(process.cwd(), "features/messaging/messages-native.css"),
  "utf8",
);
const entityCardSource = readFileSync(
  path.join(
    process.cwd(),
    "../aidream/apps/shared/chat/src/tool-call-visualization/renderers/_shared-entity/EntityCard.tsx",
  ),
  "utf8",
);

function rgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((offset) =>
    Number.parseInt(value.slice(offset, offset + 2), 16),
  ) as [number, number, number];
}

function luminance(hex: string): number {
  const channels = rgb(hex).map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

function rootToken(name: string): string {
  const lightRoot =
    messagesCss.match(/\.messages-native\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  const value = lightRoot.match(
    new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, "i"),
  )?.[1];
  if (!value) throw new Error(`Missing ${name} in the Messages light theme`);
  return value;
}

function darkToken(name: string): string {
  const darkRoot =
    messagesCss.match(
      /\.messages-native\[data-theme="dark"\],[\s\S]*?\{([\s\S]*?)\n\}/,
    )?.[1] ?? "";
  const value = darkRoot.match(
    new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, "i"),
  )?.[1];
  if (!value) throw new Error(`Missing ${name} in the Messages dark theme`);
  return value;
}

describe("Messages light/dark contrast contracts", () => {
  it("proves the former cyan/white outgoing pair failed, while the shipped pair passes", () => {
    expect(contrast("#39b9f6", "#ffffff")).toBeLessThan(4.5);

    const gradient = messagesCss.match(
      /\.messages-native \.mx-msg__bubble--mine\s*\{\s*background:\s*linear-gradient\([^,]+,\s*(#[0-9a-f]{6}),\s*(#[0-9a-f]{6})\);/i,
    );
    expect(gradient).not.toBeNull();
    for (const endpoint of gradient!.slice(1)) {
      expect(
        contrast(endpoint, rootToken("--mx-msg-bubble-mine-text")),
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps the dark retry color readable on its raised control surface", () => {
    expect(contrast("#ff6b7d", "#353537")).toBeLessThan(4.5);
    expect(
      contrast(darkToken("--mx-msg-danger"), darkToken("--mx-msg-bg-raised")),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("gives a light nested card its own foreground instead of inherited outgoing white", () => {
    expect(entityCardSource).toMatch(/bg-card\s+text-card-foreground/);
  });

  it("gives failed outgoing bubbles an explicit readable surface pair", () => {
    expect(messagesCss).toMatch(
      /\.messages-native \.mx-msg__bubble--failed\s*\{[\s\S]*?background:\s*var\(--mx-msg-bg-subtle\);[\s\S]*?color:\s*var\(--mx-msg-text\);[\s\S]*?\}/,
    );
  });
});
