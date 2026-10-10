// /hr/performance is the STANDARD review; the 360 trial list lives at /hr/performance/360.
// Red before: /hr/performance rendered the 360 list and /hr/performance/360 did not exist.
import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";

jest.mock("@/features/employee-performance-reviews/standard/StandardHome", () => ({ StandardHome: () => <div data-testid="standard-home" /> }));
jest.mock("@/features/employee-performance-reviews/review-360/Review360Pages", () => ({ Review360ListPage: () => <div data-testid="review-360-list" /> }));
jest.mock("@/features/hr/shared/HrStates", () => ({ HrLoading: () => <div /> }));
jest.mock("@/features/shell/components/header/templates/RecordPageHeader", () => ({
  RecordPageHeader: ({ record }: { record: { name: string } }) => <h1>{record.name}</h1>,
}));

import Hr360Page from "@/app/(core)/hr/performance/360/page";
import HrPerformancePage from "@/app/(core)/hr/performance/page";

describe("the performance route split", () => {
  it("/hr/performance renders the standard review home, not the 360 list", () => {
    render(HrPerformancePage() as ReactElement);
    expect(screen.getByTestId("standard-home")).toBeTruthy();
    expect(screen.queryByTestId("review-360-list")).toBeNull();
    expect(screen.getByRole("heading").textContent).toBe("Performance");
  });

  it("/hr/performance/360 renders the 360 list titled as a trial", () => {
    render(Hr360Page() as ReactElement);
    expect(screen.getByTestId("review-360-list")).toBeTruthy();
    expect(screen.queryByTestId("standard-home")).toBeNull();
    expect(screen.getByRole("heading").textContent).toBe("360 review (trial)");
  });
});
