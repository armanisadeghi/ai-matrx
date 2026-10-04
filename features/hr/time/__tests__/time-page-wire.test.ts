import { callHrTimeRpc } from "../api/rpc";
import { listAttendanceExceptions } from "../exceptions/api";
import { listOvertimePreapprovals } from "../overtime/api/overtimeReads";
import {
  listPayPeriods,
  listTimeAdjustments,
} from "../periods/api/periodReads";

jest.mock("../api/rpc", () => ({
  callHrTimeRpc: jest.fn(async () => ({
    rows: [],
    page: 2,
    pageSize: 10,
    totalRows: 26,
    hasMore: true,
  })),
}));

describe("HR _time_page RPC arguments", () => {
  beforeEach(() => jest.clearAllMocks());

  it("sends the selected page and size to Exceptions", async () => {
    await listAttendanceExceptions({}, { page: 2, pageSize: 10 });
    expect(callHrTimeRpc).toHaveBeenCalledWith(
      "hr_attendance_exception_list",
      {
        p_filters: {},
        p_page: { page: 2, pageSize: 10 },
      },
      undefined,
    );
  });

  it("sends the selected page and size to Overtime", async () => {
    await listOvertimePreapprovals({}, { page: 2, pageSize: 10 });
    expect(callHrTimeRpc).toHaveBeenCalledWith(
      "hr_overtime_preapproval_list",
      {
        p_filters: {},
        p_page: { page: 2, pageSize: 10 },
      },
      undefined,
    );
  });

  it("sends the selected page and size to Pay periods", async () => {
    await listPayPeriods({}, { page: 2, pageSize: 10 });
    expect(callHrTimeRpc).toHaveBeenCalledWith(
      "hr_pay_period_list",
      {
        p_filters: {},
        p_page: { page: 2, pageSize: 10 },
      },
      undefined,
    );
  });

  it("sends the selected page and size to time adjustments", async () => {
    await listTimeAdjustments("period", { page: 2, pageSize: 10 });
    expect(callHrTimeRpc).toHaveBeenCalledWith(
      "hr_time_adjustment_list",
      {
        p_filters: { pay_period_id: "period" },
        p_page: { page: 2, pageSize: 10 },
      },
      undefined,
    );
  });
});
