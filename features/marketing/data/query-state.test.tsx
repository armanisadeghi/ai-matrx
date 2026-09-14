import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  normalizeSnapshotAppendState,
  useMarketingTableState,
} from "./query-state";
import type { MatrxDataTableQueryState } from "@ai-matrx/design-system/data-table/types";

let urlState = "page=3&pageSize=999&q=hello&q_match=whole_words";
const replace = jest.fn();
jest.mock("next/navigation", () => ({
  usePathname: () => "/marketing/snapshots",
  useRouter: () => ({ push: jest.fn(), replace }),
  useSearchParams: () => new URLSearchParams(urlState),
}));

let table: ReturnType<typeof useMarketingTableState> | null = null;
function Harness() {
  table = useMarketingTableState({ defaultSort: { id: "captured_at", direction: "desc" } });
  return null;
}

describe("snapshot append URL state", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    jest.useFakeTimers();
    replace.mockReset();
    urlState = "page=3&pageSize=999&q=hello&q_match=whole_words";
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    act(() => root.render(<Harness />));
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    jest.useRealTimers();
  });

  it("normalizes cursor-incompatible URL paging with replace and cancels queued writes", () => {
    expect(table?.state.page).toBe(3);
    const normalized = normalizeSnapshotAppendState(table!.state);
    expect(normalized).toMatchObject({ page: 1, pageSize: 25, searchMatchMode: "whole_words" });
    act(() => table!.onStateChange({ ...table!.state, search: "typing" }));
    act(() => table!.replaceState(normalized));
    expect(replace).toHaveBeenCalledWith("/marketing/snapshots?q=hello&q_match=whole_words", { scroll: false });
    act(() => jest.advanceTimersByTime(300));
    expect(replace).toHaveBeenCalledTimes(1);
  });
});
