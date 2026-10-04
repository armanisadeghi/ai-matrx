import type { PageRequest } from "./types";

/** Only for RPCs using hr._time_page; punch/grid reads use limit/offset instead. */
export function toTimePage(page: PageRequest): {
  page: number;
  pageSize: number;
} {
  return { page: page.page, pageSize: page.pageSize };
}

/** Offered sizes match hr._time_page's actual request contract (maximum 500). */
export const HR_TIME_PAGE_SIZES = [10, 25, 50, 100, 250, 500];
