// /hr/performance is the STANDARD review; the 360 trial list lives at /hr/performance/360.
// Red before: /hr/performance rendered the 360 list and /hr/performance/360 did not exist.
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";

jest.mock("@/features/employee-performance-reviews/standard/StandardHome", () => ({ StandardHome: () => <div data-testid="standard-home" /> }));
jest.mock("@/features/employee-performance-reviews/review-360/Review360Pages", () => ({ Review360ListPage: () => <div data-testid="review-360-list" /> }));
jest.mock("@/features/hr/shared/HrStates", () => ({ HrLoading: () => <div /> }));
jest.mock("@/features/shell/components/header/templates/RecordPageHeader", () => ({
  RecordPageHeader: ({ record }: { record: { name: string } }) => <h1>{record.name}</h1>,
}));

import Hr360Page from "@/app/(core)/hr/performance/360/page";
import HrPerformancePage from "@/app/(core)/hr/performance/page";

const html = (el: unknown) => renderToStaticMarkup(el as ReactElement);

describe("the performance route split", () => {
  it("/hr/performance renders the standard review home, not the 360 list", async () => {
    const out = html(await HrPerformancePage({ searchParams: Promise.resolve({}) }));
    expect(out).toContain('data-testid="standard-home"');
    expect(out).not.toContain("review-360-list");
    expect(out).toContain("<h1>Performance</h1>");
  });

  it("/hr/performance/360 renders the 360 list titled as a trial", async () => {
    const out = html(await Hr360Page({ searchParams: Promise.resolve({}) }));
    expect(out).toContain('data-testid="review-360-list"');
    expect(out).not.toContain("standard-home");
    expect(out).toContain("<h1>360 review (trial)</h1>");
  });
});
