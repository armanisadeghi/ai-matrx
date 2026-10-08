/**
 * A catalog card names the class an agent runs on when the row carries its
 * pin, and never guesses one when it does not (an older list read).
 */

import { isValidElement } from "react";
import { renderCatalogModelRef } from "../catalogModelRef";

jest.mock("@ai-matrx/chat/agents/components/identity-refs/AiIdentityRef", () => ({
  AiModelRef: () => null,
}));

const MODEL = "0b6f1c2e-4d7a-4e8b-9c1d-2a3b4c5d6e7f";
const LIGHTNING = "29874e67-5683-40c2-9adb-fb797ea9a176";

function propsOf(args: Record<string, unknown>) {
  const el = renderCatalogModelRef(args as { modelId: string });
  if (!isValidElement(el)) throw new Error("not an element");
  return el.props as { showClass: boolean; offeringId: string | null };
}

describe("catalog renderModelRef", () => {
  it("a pinned row names its class", () => {
    expect(propsOf({ modelId: MODEL, offeringId: LIGHTNING })).toMatchObject({
      showClass: true,
      offeringId: LIGHTNING,
    });
  });

  it("an unpinned row names the preferred class", () => {
    expect(propsOf({ modelId: MODEL, offeringId: null })).toMatchObject({
      showClass: true,
      offeringId: null,
    });
  });

  it("a row without the column names the model alone", () => {
    expect(propsOf({ modelId: MODEL })).toMatchObject({ showClass: false });
  });
});
