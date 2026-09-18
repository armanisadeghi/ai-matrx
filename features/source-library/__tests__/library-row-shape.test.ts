/**
 * THE ROW THE SERVER REALLY SENDS FOR ONE LIBRARY.
 *
 * `API-CONTRACT.md` §3 publishes "200 → Library row" for both
 * `POST /media/libraries` and `GET /media/libraries/{library_id}`. The running
 * server (build e09d986, 2026-09-17) returns an ENVELOPE instead —
 * `{"library": {…}, "resolved": {…}}` and `{"library": {…}}` — and reading the
 * envelope as the row is completely silent: every field comes back
 * `undefined`. That is why the Library page's title sat in a skeleton on BOTH
 * Libraries in the account, why the failed-catalogue sentence on the TED row
 * was never rendered (the row never arrived), and why a successful create would
 * have navigated to `/libraries/undefined`.
 *
 * RED PROOF: in `../api.ts`, change `asLibraryRow(unwrap<unknown>(result))`
 * back to `unwrap<LibraryRow>(result)` in `getLibrary` and `createLibrary`.
 * → "reads the Library out of the envelope the server actually sends" fails
 *   with `undefined` for `id` and `name`.
 */

const callApi = jest.fn();

jest.mock("@/lib/api/call-api", () => ({
    __esModule: true,
    callApi: (config: unknown) => callApi(config),
}));

import { createLibrary, getLibrary } from "../api";

// `dispatch` here is the thunk-runner the real store provides: it invokes what
// `callApi` returned. Nothing about the response shape is faked — only the
// transport.
const dispatch = ((thunk: unknown) => thunk) as never;

const ROW = {
    id: "3a2ddefc-ba06-4722-9d63-00317ca3f8cd",
    name: "TED",
    handle: "@ted",
    sync_status: "failed",
    sync_error: "Listing 'TED' stopped after 5,810 videos.",
    item_count: 5810,
};

afterEach(() => jest.clearAllMocks());

describe("one Library, read from the wire", () => {
    it("reads the Library out of the envelope the server actually sends", async () => {
        callApi.mockReturnValue({ data: { library: ROW } });
        const row = await getLibrary(dispatch, ROW.id);
        expect(row.id).toBe(ROW.id);
        expect(row.name).toBe("TED");
        expect(row.sync_status).toBe("failed");
        expect(row.sync_error).toContain("stopped after 5,810 videos");
    });

    it("still reads the bare row the contract promises, if it ever arrives", async () => {
        callApi.mockReturnValue({ data: ROW });
        const row = await getLibrary(dispatch, ROW.id);
        expect(row.id).toBe(ROW.id);
        expect(row.name).toBe("TED");
    });

    it("create reads the id out of the create envelope too", async () => {
        callApi.mockReturnValue({
            data: { library: ROW, resolved: { title: "TED" } },
        });
        const row = await createLibrary(dispatch, { input: "@ted" });
        expect(row.id).toBe(ROW.id);
    });

    it("create never names an organization of its own", async () => {
        callApi.mockReturnValue({ data: { library: ROW } });
        await createLibrary(dispatch, { input: "@ted" });
        const body = (callApi.mock.calls[0][0] as { body: Record<string, unknown> })
            .body;
        expect("organization_id" in body).toBe(false);
    });

    it("sends a visibility word the server's enum actually contains", async () => {
        // The server refuses the whole request otherwise:
        // "`body.visibility`: Input should be 'personal', 'internal', 'link'
        // or 'public'". This repo sent "private" until 2026-09-17.
        callApi.mockReturnValue({ data: { library: ROW } });
        await createLibrary(dispatch, { input: "@ted" });
        const body = (callApi.mock.calls[0][0] as { body: Record<string, unknown> })
            .body;
        expect(["personal", "internal", "link", "public"]).toContain(
            body.visibility,
        );
    });

    it("reads the Python repr the server sends for visibility as the word it means", async () => {
        callApi.mockReturnValue({
            data: { library: { ...ROW, visibility: "Visibility.INTERNAL" } },
        });
        const row = await getLibrary(dispatch, ROW.id);
        expect(row.visibility).toBe("internal");
    });

    it("an explicit organization override is still sent, because it is deliberate", async () => {
        callApi.mockReturnValue({ data: { library: ROW } });
        await createLibrary(dispatch, {
            input: "@ted",
            organizationId: "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f",
        });
        const body = (callApi.mock.calls[0][0] as { body: Record<string, unknown> })
            .body;
        expect(body.organization_id).toBe("884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f");
    });
});
