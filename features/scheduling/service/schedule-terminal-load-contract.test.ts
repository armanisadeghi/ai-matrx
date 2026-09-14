import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const read = (relative: string) =>
  fs.readFileSync(path.join(root, relative), "utf8");

describe("schedule terminal loading contract", () => {
  it("bounds record and run-history reads with an abort signal and visible terminal errors", () => {
    const source = read("service/queries.ts");

    expect(source).toMatch(
      /async function getAgentTask[\s\S]*?createScheduleLoadTimeout\(\)[\s\S]*?abortSignal\(controller\.signal\)[\s\S]*?SCHEDULE_DETAIL_LOAD_TIMEOUT_MESSAGE/,
    );
    expect(source).toMatch(
      /async function listRunsForTask[\s\S]*?createScheduleLoadTimeout\(\)[\s\S]*?abortSignal\(controller\.signal\)[\s\S]*?SCHEDULE_RUNS_LOAD_TIMEOUT_MESSAGE/,
    );
  });

  it("puts manual Retry actions on every schedule detail error consumer", () => {
    expect(read("components/detail/ScheduleDetail.tsx")).toMatch(
      /status === "error" \|\| !task[\s\S]*?onClick=\{retry\}[\s\S]*?Retry/,
    );
    expect(read("../../app/(core)/schedules/[id]/edit/page.tsx")).toMatch(
      /status === "error" \|\| !task[\s\S]*?onClick=\{retry\}[\s\S]*?Retry/,
    );
    expect(read("components/detail/RunHistoryCard.tsx")).toMatch(
      /status === "error"[\s\S]*?onClick=\{retry\}[\s\S]*?Retry/,
    );
  });
});
