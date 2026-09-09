import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DefinitionEditHelp } from "../DefinitionEditHelp";
import { EMPTY_MANDATE_CONTRACT } from "../../contract";
import type { CopyButtonsProps } from "@/components/agent-copy/CopyButtons";

let copiedProps: CopyButtonsProps | undefined;
jest.mock("@/components/agent-copy/CopyButtons", () => ({
  CopyButtons: (props: CopyButtonsProps) => {
    copiedProps = props;
    return <button>Copy for AI</button>;
  },
}));

const data: React.ComponentProps<typeof DefinitionEditHelp>["data"] = {
  mandate: {
    label: "Research Output: Slides",
    mandate_key: "research_client.output_slides",
    origin: "code",
    code_path: null,
    output_kind: "presentation_deck",
  },
  provisionKey: "research_client.report_output",
  contract: EMPTY_MANDATE_CONTRACT,
  offer: {
    id: "provision-1",
    provisionKey: "research_client.report_output",
    label: "Research Report Output",
    description: "Research report and voice",
    offerKindSlug: null,
    values: [],
    isEnabled: true,
    codePath: "aidream.services.mandates.client_mandates",
  },
};

beforeEach(() => {
  copiedProps = undefined;
});

it("exposes the recorded provision source and copies the identity, location and repair instructions", () => {
  const html = renderToStaticMarkup(
    <DefinitionEditHelp data={data} section="Provision" authoring />,
  );
  expect(html).toContain("cannot be edited here");
  expect(html).toContain("aidream.services.mandates.client_mandates");
  const payload =
    typeof copiedProps?.agent === "function" ? copiedProps.agent() : undefined;
  expect(JSON.stringify(payload)).toContain(
    '"provisionKey":"research_client.report_output"',
  );
  expect(JSON.stringify(payload)).toContain(
    '"sourceLocation":"aidream.services.mandates.client_mandates"',
  );
  expect(JSON.stringify(payload)).toContain(
    "every mandate sharing this Provision",
  );
});

it("never substitutes the provision module for a missing output declaration location", () => {
  const html = renderToStaticMarkup(
    <DefinitionEditHelp data={data} section="Output" authoring />,
  );
  expect(html).toContain("Not recorded");
  expect(html).toContain("Related Provision module");
  const payload =
    typeof copiedProps?.agent === "function" ? copiedProps.agent() : undefined;
  expect(JSON.stringify(payload)).toContain('"sourceLocation":"Not recorded"');
  expect(JSON.stringify(payload)).toContain(
    "not a verified Output declaration location",
  );
});

it.each(["Goal", "Provision", "Output"] as const)(
  "gives a non-admin a meaningful path for %s without exposing source handoff",
  (section) => {
    const html = renderToStaticMarkup(
      <DefinitionEditHelp data={data} section={section} authoring={false} />,
    );
    expect(html).toContain("create a separate mandate");
    expect(html).toContain("system you control");
    expect(html).not.toContain("aidream.services");
    expect(copiedProps).toBeUndefined();
  },
);

it("does not tell admins to patch code for a database-owned output", () => {
  const html = renderToStaticMarkup(
    <DefinitionEditHelp
      data={{ ...data, mandate: { ...data.mandate, origin: "manual" } }}
      section="Output"
      authoring
    />,
  );
  expect(html).toContain("has no editor on this page");
  expect(html).not.toContain("is defined in code");
});

it.each(["unknown", "   ", " unknown "])(
  "does not misrepresent missing related source %p",
  (codePath) => {
    if (!data.offer) throw new Error("Fixture requires an offer");
    const html = renderToStaticMarkup(
      <DefinitionEditHelp
        data={{ ...data, offer: { ...data.offer, codePath } }}
        section="Output"
        authoring
      />,
    );
    expect(html).toContain("Not recorded");
    expect(html).not.toContain("Related Provision module");
  },
);

it("keeps a named but unavailable provision code-owned", () => {
  const html = renderToStaticMarkup(
    <DefinitionEditHelp
      data={{ ...data, offer: null }}
      section="Provision"
      authoring
    />,
  );
  expect(html).toContain("is defined in code");
  expect(html).toContain("Not recorded");
});
