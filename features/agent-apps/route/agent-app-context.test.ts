import { APP_BUNDLE_CODE_MAX_CHARS, buildAgentAppBundle } from "./agent-app-context";

const base = {
  id: "0a20e787-aee2-4de1-b245-5df2b687dab5",
  slug: "precision-fact-checker",
  name: "Fact Checker",
  tagline: "Deconstruct claims & uncover the truth.",
  status: "published",
  visibility: "public",
  tags: [],
  version: 3,
  shell_kind: "fully_custom",
  component_language: "tsx",
  variable_schema: [{ name: "claim", type: "string", label: "Claim", required: false }],
  total_executions: 12,
};

it("packs the open app as one escaped XML element within the page budget", () => {
  const xml = buildAgentAppBundle(
    { ...base, component_code: "x".repeat(20_000) },
    "run",
  );
  expect(xml.startsWith('<agent_app id="0a20e787')).toBe(true);
  expect(xml).toContain('public_url="/p/precision-fact-checker"');
  expect(xml).toContain('view="run"');
  expect(xml).toContain("&amp; uncover");
  expect(xml).toContain('<variable name="claim" label="Claim" type="string"/>');
  expect(xml).toContain('clipped="true" total_chars="20000"');
  expect(xml).not.toContain("tags=");
  expect(xml.length).toBeLessThan(APP_BUNDLE_CODE_MAX_CHARS + 2000);
  expect(xml.length).toBeLessThanOrEqual(9000);
});

it("omits parts the app does not have instead of rendering blanks", () => {
  const xml = buildAgentAppBundle({ ...base, visibility: "personal", component_code: "" });
  expect(xml).not.toContain("public_url");
  expect(xml).not.toContain("<component_code");
  expect(xml).not.toContain("<description");
});

it("carries the latest run — input, status, clipped result — and nothing for an idle page", () => {
  const withRun = buildAgentAppBundle(base, "run", {
    status: "done",
    conversationId: "c-1",
    input: { claim: "Goldfish have a three-second memory." },
    result: "r".repeat(9000),
  });
  expect(withRun).toContain('<latest_run status="done" conversation_id="c-1">');
  expect(withRun).toContain('<value name="claim">Goldfish have a three-second memory.</value>');
  expect(withRun).toContain('clipped="true" total_chars="9000"');
  expect(withRun.length).toBeLessThanOrEqual(9000);
  expect(buildAgentAppBundle(base, "run", { status: "idle" })).not.toContain("latest_run");
});
