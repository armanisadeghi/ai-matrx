import { renderHook, settle } from "@/test-utils/renderHook";

const mockMaybeSingle = jest.fn();
const mockResolveCanonicalProcessedDocumentId = jest.fn();

interface QueryMock {
  select: () => QueryMock;
  is: () => QueryMock;
  eq: () => QueryMock;
  order: () => QueryMock;
  limit: () => QueryMock;
  maybeSingle: (...args: unknown[]) => unknown;
}

const query: QueryMock = {
  select: jest.fn((): QueryMock => query),
  is: jest.fn((): QueryMock => query),
  eq: jest.fn((): QueryMock => query),
  order: jest.fn((): QueryMock => query),
  limit: jest.fn((): QueryMock => query),
  maybeSingle: (...args: unknown[]) => mockMaybeSingle(...args),
};

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    schema: () => ({ from: () => query }),
  },
}));

jest.mock("@/features/files/api/document-lookup", () => ({
  resolveCanonicalProcessedDocumentId: (...args: unknown[]) =>
    mockResolveCanonicalProcessedDocumentId(...args),
}));

import { usePdfSurfaceLinks } from "./usePdfSurfaceLinks";

describe("usePdfSurfaceLinks verified processed-document identity", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("does not expose an unverified library id as a processed document", async () => {
    let finishLookup!: (value: { data: null }) => void;
    mockMaybeSingle.mockReturnValueOnce(
      new Promise<{ data: null }>((resolve) => {
        finishLookup = resolve;
      }),
    );

    const hook = await renderHook(() =>
      usePdfSurfaceLinks({ processedDocumentId: "library-doc-id" }),
    );

    expect(hook.current.loading).toBe(true);
    expect(hook.current.ids).toEqual({
      fileId: null,
      processedDocumentId: null,
    });

    await hook.act(async () => finishLookup({ data: null }));
    await settle(hook, (value) => !value.loading, "missing document lookup");
    expect(hook.current.ids.processedDocumentId).toBeNull();
    await hook.unmount();
  });

  it("exposes a real processed document after the identity lookup succeeds", async () => {
    let finishLookup!: (value: {
      data: { source_kind: string; source_id: string };
    }) => void;
    mockMaybeSingle.mockReturnValueOnce(
      new Promise<{
        data: { source_kind: string; source_id: string };
      }>((resolve) => {
        finishLookup = resolve;
      }),
    );

    const hook = await renderHook(() =>
      usePdfSurfaceLinks({ processedDocumentId: "processed-document-id" }),
    );

    expect(hook.current.ids.processedDocumentId).toBeNull();
    await hook.act(async () =>
      finishLookup({
        data: { source_kind: "web", source_id: "https://example.com/source" },
      }),
    );
    await settle(
      hook,
      (value) => value.ids.processedDocumentId === "processed-document-id",
      "verified document identity",
    );
    expect(hook.current.loading).toBe(false);
    await hook.unmount();
  });
});
