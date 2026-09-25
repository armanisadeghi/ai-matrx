/**
 * 🚨 F-76 — CI's `check-org-refusal-honesty` found `documents/service.ts`
 * resolving an organization (`requireOrganizationContext` inside
 * `refreshGoogleDocument`) and leaving the person with NOTHING when the answer
 * is "none selected".
 *
 * `useOpenGoogleDocumentRecord`'s birth door — a picked file with no
 * `record_id` and no existing `workbench.google_document` row — calls
 * `refreshGoogleDocument({ fileId })` with NO explicit organization: it resolves
 * the ACTIVE org from the store singleton, and fails closed
 * (`OrganizationContextError("organization_context_required")`) with none
 * selected. `OpenGoogleDocumentRecordButton`'s catch used to hand that raw wire
 * sentence ("Select an organization before sending this request.") straight to
 * `toast.error` — an instruction to a programmer, with no remedy — via
 * `failureSentence`, which returns any error's `.message` verbatim.
 *
 * This proves the fix: with no organization selected, clicking "Open the
 * record" shows the honest, actionable refusal (never the raw wire sentence),
 * and the record is never born — no refresh call reaches Google.
 */

import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

import { OpenGoogleDocumentRecordButton, type PickedGoogleRecordResource } from "../openRecord";
import type { postGoogleBackend as postGoogleBackendReal } from "@/features/marketing/google/service";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let activeOrganizationId: string | null = null;

/**
 * The mock is typed from the REAL function's parameter list, so a signature
 * change over in `features/marketing/google/service.ts` breaks this file
 * instead of silently letting it stand in for something that no longer exists.
 *
 * Its RETURN is deliberately narrower than `Response`: `refreshGoogleDocument`
 * reads exactly `status` and `json()` (through `responseRecord`), and jsdom has
 * no `Response` constructor to build a real one with. Declaring the narrow
 * reply is the honest shape — the alternative was `jest.fn(async () => {
 * throw … })`, whose return type TypeScript infers as `Promise<never>`, which
 * then refuses EVERY `mockImplementation` the file needs (TS2345). A cast or a
 * ts-expect-error would have hidden that rather than fixed it.
 */
type GoogleBackendReply = Pick<Response, "status" | "json">;
type PostGoogleBackendArgs = Parameters<typeof postGoogleBackendReal>;

const postGoogleBackend = jest.fn<Promise<GoogleBackendReply>, PostGoogleBackendArgs>(
  async () => {
    throw new Error(
      "refreshGoogleDocument must never reach the network with no organization",
    );
  },
);

jest.mock("@/utils/supabase/client", () => {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  Object.assign(chain, {
    schema: self,
    from: self,
    select: self,
    eq: self,
    is: self,
    order: self,
    limit: self,
    abortSignal: self,
    // No existing record for this resource — the birth door is what runs next.
    maybeSingle: async () => ({ data: null, error: null }),
  });
  return { supabase: chain, createClient: () => chain };
});

jest.mock("@/features/marketing/google/service", () => ({
  postGoogleBackend: (...args: PostGoogleBackendArgs) => postGoogleBackend(...args),
}));

// The birth door resolves the ACTIVE organization from the store singleton —
// never the resource's own — which is exactly the "none selected" case this
// proves. `requireOrganizationContext` itself is left UNMOCKED: it is the real
// `@ai-matrx/agents/matrx` kernel, so this is the real fail-closed refusal, not
// a stand-in for it.
jest.mock("@/lib/redux/store-singleton", () => ({
  // The organization gate (lib/organization/organization-gate.ts) reads
  // `state.appContext.organization_id` itself, so the store answers in that shape.
  getStoreSingleton: () => ({
    getState: () => ({ appContext: { organization_id: activeOrganizationId } }),
  }),
}));
jest.mock("@/lib/redux/slices/appContextSlice", () => ({
  selectOrganizationId: () => activeOrganizationId,
}));

jest.mock("@/lib/detail/useOpenDetail", () => ({
  useOpenDetail: () => jest.fn(async () => "window"),
}));

const toasts = { success: jest.fn(), error: jest.fn() };
jest.mock("@/lib/toast", () => ({
  toast: {
    success: (...a: unknown[]) => toasts.success(...a),
    error: (...a: unknown[]) => toasts.error(...a),
  },
}));

const resource: PickedGoogleRecordResource = {
  id: "44444444-5555-6666-7777-888888888888",
  resource_ref: "1AbCdEfGhIjKlMnOpQrStUvWxYz",
  resource_type: "google_document",
  display_name: "Q3 Plan",
};

async function mount(node: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(node);
  });
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

async function click(container: HTMLElement) {
  const button = container.querySelector<HTMLElement>("[data-google-record-open]");
  if (!button) throw new Error("no open-record control rendered");
  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

beforeEach(() => {
  postGoogleBackend.mockClear();
  toasts.success.mockClear();
  toasts.error.mockClear();
  activeOrganizationId = null;
});

describe("with no organization selected", () => {
  it("shows the honest refusal, never the raw wire sentence", async () => {
    const m = await mount(<OpenGoogleDocumentRecordButton resource={resource} />);
    try {
      await click(m.container);
      expect(toasts.error).toHaveBeenCalledTimes(1);
      const [title, options] = toasts.error.mock.calls[0] as [string, { description?: string }];
      const shown = `${title} ${options?.description ?? ""}`;
      expect(shown).toContain("Choose an organization first");
      expect(shown).toContain("no organization is selected");
      expect(shown).not.toContain("Select an organization before sending this request.");
    } finally {
      m.unmount();
    }
  });

  it("never reaches Google — the record is not born without an organization", async () => {
    const m = await mount(<OpenGoogleDocumentRecordButton resource={resource} />);
    try {
      await click(m.container);
      expect(postGoogleBackend).not.toHaveBeenCalled();
    } finally {
      m.unmount();
    }
  });
});

describe("once an organization is selected", () => {
  it("does not show the organization refusal", async () => {
    activeOrganizationId = "5dc930e9-bd65-44a1-8369-af773f6e1a5b";
    postGoogleBackend.mockImplementation(async () => ({
      status: 200,
      json: async () => ({
        id: "born-doc-1",
        organization_id: activeOrganizationId,
        resource_id: resource.id,
        external_id: resource.resource_ref,
        title: resource.display_name,
        mime_kind: "document",
        external_url: null,
        owner_email: null,
        external_modified_at: null,
        body_chars: 0,
        synced_at: "2026-09-18T15:00:00Z",
        sync_status: "available",
        sync_status_reason: null,
        export_mime: "text/plain",
      }),
    }));
    const m = await mount(<OpenGoogleDocumentRecordButton resource={resource} />);
    try {
      await click(m.container);
      expect(postGoogleBackend).toHaveBeenCalledTimes(1);
      const shown = toasts.error.mock.calls.map((c) => JSON.stringify(c)).join(" ");
      expect(shown).not.toContain("Choose an organization first");
    } finally {
      m.unmount();
    }
  });
});
