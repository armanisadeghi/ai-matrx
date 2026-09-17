// Bugbot LOW (frontend PR 228, comment 4041625800): the detail page route
// re-decoded `type`/`id` after the App Router had already decoded them, so a
// segment carrying an encoded `%` (i.e. the URL held `%25`, and the router
// handed the page the already-decoded `%`) threw `URIError: URI malformed`
// on the SECOND decodeURIComponent call and the page never rendered.
//
// This drives the actual page module (not a copy) so a regression that
// re-adds a decode on `type`/`id` fails here.

jest.mock("@/features/window-panels/detail/DetailPageRoute", () => ({
  DetailPageRoute: jest.fn(() => null),
}));

import { DetailPageRoute } from "@/features/window-panels/detail/DetailPageRoute";
import DetailPage from "../page";

// The page returns a JSX element (`<DetailPageRoute .../>`) without
// rendering it, so the component function is never called — we read the
// element's own props instead of asserting a call.
describe("the detail page route's params", () => {
  it("does not double-decode a literal % in type/id", async () => {
    // The router already decoded this segment: the URL held `%25`, so the
    // param the page receives is the literal string "%".
    const params = Promise.resolve({ type: "file", id: "%" });
    const searchParams = Promise.resolve({});

    let element: Awaited<ReturnType<typeof DetailPage>>;
    await expect(
      (async () => {
        element = await DetailPage({ params, searchParams });
      })(),
    ).resolves.not.toThrow();

    expect(element!.type).toBe(DetailPageRoute);
    expect(element!.props).toEqual(
      expect.objectContaining({ type: "file", id: "%" }),
    );
  });

  it("passes an id containing %25 through unchanged", async () => {
    // A record id that is itself the three characters "%25" (already
    // decoded once by the router) must reach the record with that literal
    // value — not decoded again into "%".
    const params = Promise.resolve({ type: "file", id: "%25" });
    const searchParams = Promise.resolve({});

    const element = await DetailPage({ params, searchParams });

    expect(element.props).toEqual(expect.objectContaining({ id: "%25" }));
  });
});
