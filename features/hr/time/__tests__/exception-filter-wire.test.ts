import { callHrTimeRpc } from "../api/rpc";
import { listAttendanceExceptions } from "../exceptions/api";
import { readExceptionFilters } from "../exceptions/readExceptionFilters";

jest.mock("../api/rpc", () => ({
  callHrTimeRpc: jest.fn(async () => ({
    rows: [],
    page: 1,
    pageSize: 10,
    totalRows: 0,
  })),
}));

describe("HR exception filter wire contract", () => {
  beforeEach(() => jest.clearAllMocks());

  it("encodes scalar filters from period and kind callers as arrays", async () => {
    await listAttendanceExceptions(
      {
        resolutionState: "open",
        exceptionKind: "missed_punch",
        severity: "warn",
        payPeriodId: "period",
      },
      { page: 1, pageSize: 10 },
    );
    expect(callHrTimeRpc).toHaveBeenCalledWith(
      "hr_attendance_exception_list",
      {
        p_filters: {
          resolution_state: ["open"],
          exception_kind: ["missed_punch"],
          severity: ["warn"],
          pay_period_id: "period",
        },
        p_page: { page: 1, pageSize: 10 },
      },
      undefined,
    );
  });
  it("preserves all selected values from the table to the RPC", async () => {
    const filters = readExceptionFilters({
      columnFilters: {
        severity: { kind: "select", value: "warn", values: ["warn", "info"] },
        resolutionState: {
          kind: "select",
          value: "open",
          values: ["open", "acknowledged"],
        },
        exceptionKind: {
          kind: "select",
          value: "missed_punch",
          values: ["missed_punch", "no_show"],
        },
      },
    });
    expect(filters).toEqual({
      severity: ["warn", "info"],
      resolutionState: ["open", "acknowledged"],
      exceptionKind: ["missed_punch", "no_show"],
    });
    await listAttendanceExceptions(filters, { page: 1, pageSize: 10 });
    expect(callHrTimeRpc).toHaveBeenCalledWith(
      "hr_attendance_exception_list",
      {
        p_filters: {
          severity: ["warn", "info"],
          resolution_state: ["open", "acknowledged"],
          exception_kind: ["missed_punch", "no_show"],
        },
        p_page: { page: 1, pageSize: 10 },
      },
      undefined,
    );
  });

  it("clears empty sets without excluding every record", async () => {
    expect(
      readExceptionFilters({
        columnFilters: {
          severity: { kind: "select", values: [], value: "warn" },
        },
      }),
    ).toEqual({});
    await listAttendanceExceptions(
      {
        severity: [],
        resolutionState: [],
        exceptionKind: [],
        employmentId: "employee",
        affectsUnapprovedPeriod: false,
      },
      { page: 1, pageSize: 10 },
    );
    expect(callHrTimeRpc).toHaveBeenCalledWith(
      "hr_attendance_exception_list",
      {
        p_filters: {
          employment_id: "employee",
          affects_unapproved_period: false,
        },
        p_page: { page: 1, pageSize: 10 },
      },
      undefined,
    );
  });
  it("reads legacy single-value table filters as singleton sets", () => {
    expect(
      readExceptionFilters({
        columnFilters: { severity: { kind: "select", value: "warn" } },
      }),
    ).toEqual({ severity: ["warn"] });
  });
});
