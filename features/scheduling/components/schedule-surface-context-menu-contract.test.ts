import { readFileSync } from "node:fs";
import { join } from "node:path";

function source(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("schedule surface context-menu contract", () => {
  it("mounts one delegated read-only menu for the schedule roster", () => {
    const list = source(
      "features/scheduling/components/list/ScheduleList.tsx",
    );
    const row = source("features/scheduling/components/list/ScheduleRow.tsx");

    expect(list.match(/<NonEditableContextMenu/g)).toHaveLength(1);
    expect(list).toMatch(
      /<NonEditableContextMenu[\s\S]*?<div className="contents">[\s\S]*?<ScheduleListBody \/>/,
    );
    expect(list).toContain('surfaceName="matrx-user/schedules"');
    expect(list).toContain("resolveContextOnOpen={(target)");
    expect(list).toContain("[data-schedule-id]");
    expect(row).toContain("data-schedule-id={task.id}");
  });

  it("mounts one read-only menu for a saved schedule", () => {
    const detail = source(
      "features/scheduling/components/detail/ScheduleDetail.tsx",
    );

    expect(detail.match(/<NonEditableContextMenu/g)).toHaveLength(1);
    expect(detail).toMatch(
      /<NonEditableContextMenu[\s\S]*?<div className="contents">[\s\S]*?<ScheduleDetailBody taskId=\{taskId\} \/>/,
    );
    expect(detail).toContain('surfaceName="matrx-user/schedules"');
    expect(detail).toContain("getApplicationScope={getSchedulesScope}");
    expect(detail).toContain('contentSource={{ type: "raw" }}');
  });

  it("mounts one editable menu over the draft form", () => {
    const form = source(
      "features/scheduling/components/form/ScheduleForm.tsx",
    );

    expect(form.match(/<EditableContextMenu/g)).toHaveLength(1);
    expect(form).toContain('surfaceName="matrx-user/schedules"');
    expect(form).toContain("getApplicationScope={getSchedulesScope}");
    expect(form).toContain("context-menu-exempt: entity");
  });
});
