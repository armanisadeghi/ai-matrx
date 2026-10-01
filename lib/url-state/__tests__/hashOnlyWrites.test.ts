import { replaceAddressWithoutNavigating } from "../addressWithoutNavigating";
import * as model from "./nextHistoryModel";

/**
 * A canvas writes its camera to `#cam=` while panning. Each write that went
 * through Next's history patch dispatched `restore`, re-rendering every
 * `useSearchParams` reader on the page — over a second per pointer move on a
 * board of fifteen heavy tiles (2026-10-01). A hash-only write must never wake
 * Next; a query write still must.
 */
describe("hash-only address writes stay out of Next's router", () => {
  beforeEach(() => model.installNextHistoryModel("/board?view=grid"));
  afterEach(() => model.uninstallNextHistoryModel());

  it("sixty camera writes dispatch no restore, keep Next's entry, and land in the address bar", () => {
    const before = model.restoreCount;
    for (let i = 0; i < 60; i++) replaceAddressWithoutNavigating(`/board?view=grid#cam=${i},0,1.000`);
    expect(model.restoreCount - before).toBe(0);
    expect(window.location.hash).toBe("#cam=59,0,1.000");
    expect((window.history.state as { __NA?: unknown }).__NA).toBe(true);
    expect(model.routerSearch().get("view")).toBe("grid");
  });

  it("a query change still reaches useSearchParams", () => {
    const before = model.restoreCount;
    replaceAddressWithoutNavigating("/board?view=list#cam=1,0,1.000");
    expect(model.restoreCount - before).toBe(1);
    expect(model.routerSearch().get("view")).toBe("list");
  });
});
