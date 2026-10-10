/**
 * NOTHING FAILS SILENTLY: a refused table-templates read is said in the template field's own error
 * slot (the store's words), never turned into an empty list. The rest of the form stays usable.
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const tableTemplates = jest.fn();
jest.mock("@/features/scopes/service/scopeDoors", () => ({ scopeDoors: () => ({ tableTemplates }) }));
jest.mock("@/features/scopes/components/reference/ReferenceValuePicker", () => ({ ReferenceValuePicker: () => null }));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));

import { ReferenceConfigFields } from "../ReferenceConfigFields";

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = "";
  tableTemplates.mockReset();
});

async function mount() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <ReferenceConfigFields
        allowedReferenceTypes={["url"]}
        onToggleReferenceType={() => {}}
        maxItems="1"
        onMaxItemsChange={() => {}}
        allowedScopeTypeIds={[]}
        onToggleAllowedScopeType={() => {}}
        orgScopeTypes={[]}
        organizationId="org-1"
        datasetTemplateId={null}
        onDatasetTemplateChange={() => {}}
        showPreview={false}
      />,
    );
  });
  return host;
}

it("says why the templates could not be read, and keeps the form usable", async () => {
  tableTemplates.mockResolvedValue({ ok: false, error: { code: "refused", message: "Templates are not open to you here." } });
  const host = await mount();
  expect(host.textContent).toContain("Templates are not open to you here.");
  const max = host.querySelector<HTMLInputElement>('input[type="number"]');
  expect(max?.disabled).toBe(false);
});

it("shows no error when the read succeeds", async () => {
  tableTemplates.mockResolvedValue({ ok: true, data: [] });
  const host = await mount();
  expect(host.textContent).not.toContain("could not");
});
