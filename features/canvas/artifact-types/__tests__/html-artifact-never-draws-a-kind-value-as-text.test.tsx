/**
 * An agent emitted an artifact whose subtype nobody registered (`checklist`); it
 * fell to the HTML renderer, which drew the `{"__kind": …}` JSON as raw text.
 * A kind value in an html artifact goes to the one kind front door instead.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/features/html-pages/components/HtmlInlinePreview", () => ({
  __esModule: true,
  default: ({ code }: { code: string }) => <div data-html-preview>{code}</div>,
}));
jest.mock("@/components/official/structured-value/KindValueFrontDoor", () => ({
  __esModule: true,
  default: ({ value }: { value: unknown }) => <div data-front-door>{(value as { title?: string }).title}</div>,
}));

import HtmlArtifact, { kindValueOfHtmlBody } from "../renderers/HtmlArtifact";

const BODY = JSON.stringify({ __kind: "checklist", title: "Launch list", items: [{ text: "Order cups", done: false }] });

async function render(raw: string, isStreamActive = false): Promise<HTMLElement> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  await act(async () => {
    createRoot(host).render(<HtmlArtifact mode="artifact" raw={raw} data={raw} isStreamActive={isStreamActive} />);
  });
  return host;
}

describe("an html artifact whose body is a kind value", () => {
  it("goes to the kind front door, never to the page preview as text", async () => {
    const host = await render(BODY);
    expect(host.querySelector("[data-front-door]")?.textContent).toBe("Launch list");
    expect(host.querySelector("[data-html-preview]")).toBeNull();
    expect(host.textContent).not.toContain("__kind");
  });

  it("a real page still renders as a page", async () => {
    const host = await render("<h1>Hello</h1>");
    expect(host.querySelector("[data-html-preview]")).not.toBeNull();
    expect(host.querySelector("[data-front-door]")).toBeNull();
  });

  it("a half-arrived kind body is never drawn as text", async () => {
    const host = await render('{"__kind":"checklist","title":"Lau', true);
    expect(host.querySelector("[data-html-preview]")).toBeNull();
    expect(host.textContent).not.toContain("__kind");
  });

  it("JSON without a string __kind is not a kind value", () => {
    expect(kindValueOfHtmlBody('{"a":1}')).toBeNull();
    expect(kindValueOfHtmlBody("<p>__kind</p>")).toBeNull();
  });
});
