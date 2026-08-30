import { MOBILE_TABLE_FROZEN_THROUGH_TABLET } from "@/components/official/mobile-table/mobileTable";

describe("directive catalog mobile table contract", () => {
  it("keeps the outer wrapper as the only tablet scroll container", () => {
    const classes = new Set(MOBILE_TABLE_FROZEN_THROUGH_TABLET.split(" "));

    expect(classes.has("max-lg:table")).toBe(true);
    expect(classes.has("max-lg:overflow-visible")).toBe(true);
    expect([...classes].some((className) => className.includes("sticky"))).toBe(
      false,
    );
    expect([...classes].some((className) => className.includes("left-0"))).toBe(
      false,
    );
  });
});
