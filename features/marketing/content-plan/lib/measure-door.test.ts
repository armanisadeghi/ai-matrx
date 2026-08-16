import { measureDoorModel } from "./measure-door";

describe("measureDoorModel", () => {
  it("renders nothing when the CMS page is not joined to a measured page", () => {
    // Today's production state for EVERY row: no client_pages row carries a
    // web_page_id, so the AFTER badge must be absent — never a zero, never a
    // door that leads to an empty workspace.
    expect(measureDoorModel(null, undefined)).toBeNull();
    expect(
      measureDoorModel(null, {
        in_gsc: true,
        gsc_clicks_28d: 12,
        gsc_impressions_28d: 300,
        gsc_position_28d: 4.2,
      }),
    ).toBeNull();
  });

  it("distinguishes joined-but-unread from joined-with-no-Search-Console-rows", () => {
    const unread = measureDoorModel("web-page-1", undefined);
    expect(unread).toMatchObject({ label: "measure", hasSearchData: false });
    expect(unread?.title).toContain("have not been read yet");

    const notInGsc = measureDoorModel("web-page-1", {
      in_gsc: false,
      gsc_clicks_28d: null,
      gsc_impressions_28d: null,
      gsc_position_28d: null,
    });
    expect(notInGsc).toMatchObject({ label: "measure", hasSearchData: false });
    expect(notInGsc?.title).toContain("no Search Console rows");
  });

  it("reports zero clicks as a real measurement, not as missing data", () => {
    const zero = measureDoorModel("web-page-1", {
      in_gsc: true,
      gsc_clicks_28d: 0,
      gsc_impressions_28d: 0,
      gsc_position_28d: null,
    });
    expect(zero).toMatchObject({ label: "0", hasSearchData: true });
    expect(zero?.title).toBe(
      "Last 28 days: 0 clicks, 0 impressions, average position —",
    );
  });

  it("shows the 28d clicks and a one-decimal position when measured", () => {
    const measured = measureDoorModel("web-page-1", {
      in_gsc: true,
      gsc_clicks_28d: 1234,
      gsc_impressions_28d: 56789,
      gsc_position_28d: 7.26,
    });
    expect(measured?.hasSearchData).toBe(true);
    expect(measured?.label).toBe((1234).toLocaleString());
    expect(measured?.title).toContain("average position 7.3");
  });
});
