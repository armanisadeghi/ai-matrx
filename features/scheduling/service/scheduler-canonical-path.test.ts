import fs from "node:fs";
import path from "node:path";

const schedulingRoot = path.resolve(process.cwd(), "features/scheduling");

function read(relativePath: string): string {
  return fs.readFileSync(path.join(schedulingRoot, relativePath), "utf8");
}

function withoutComments(source: string): string {
  return source
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n");
}

describe("scheduling canonical write path", () => {
  it("keeps every user-surface write caller behind Redux thunks and schedulerClient", () => {
    const thunks = read("redux/tasks/thunks.ts");

    expect(thunks).toContain('import * as scheduler from "../../service/schedulerClient"');
    expect(thunks).toMatch(/scheduler\.createTask\(/);
    expect(thunks).toMatch(/scheduler\.patchTask\(/);
    expect(thunks).toMatch(/scheduler\.createTrigger\(/);
    expect(thunks).toMatch(/scheduler\.patchTrigger\(/);
    expect(thunks).toMatch(/scheduler\.softDeleteTask\(/);
    expect(thunks).toMatch(/scheduler\.runNow\(/);
    expect(thunks).not.toMatch(/\.schema\(["']scheduler["']\)|\.from\(["']sch_/);

    const componentsRoot = path.join(schedulingRoot, "components");
    const writeCallers = fs
      .readdirSync(componentsRoot, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
      .map((entry) => path.join(entry.parentPath, entry.name))
      .filter((file) =>
        /\b(?:createScheduledTask|updateScheduledTask|deleteScheduledTask|toggleTaskEnabled|runTaskNowThunk)\b/.test(
          withoutComments(fs.readFileSync(file, "utf8")),
        ),
      );

    expect(
      writeCallers.map((file) => path.relative(schedulingRoot, file)).sort(),
    ).toEqual([
      "components/detail/ScheduleDetail.tsx",
      "components/form/ScheduleForm.tsx",
      "components/list/DuplicateScheduleBanner.tsx",
      "components/list/ScheduleRow.tsx",
    ]);

    for (const file of writeCallers) {
      const source = withoutComments(fs.readFileSync(file, "utf8"));
      expect(source).toMatch(/redux\/tasks\/thunks/);
      expect(source).toMatch(/dispatch\(/);
      expect(source).not.toMatch(
        /schedulerClient|\.schema\(["']scheduler["']\)|\.from\(["']sch_/,
      );
    }
  });

  it("keeps direct scheduler-table access inside the documented read facade", () => {
    const productionFiles = fs
      .readdirSync(schedulingRoot, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.(ts|tsx)$/.test(entry.name))
      .map((entry) => path.join(entry.parentPath, entry.name))
      .filter((file) => !/\.test\.tsx?$/.test(file));

    const directTableCallers = productionFiles
      .filter((file) =>
        /\.from\(["']sch_/.test(withoutComments(fs.readFileSync(file, "utf8"))),
      )
      .map((file) => path.relative(schedulingRoot, file));

    expect(directTableCallers).toEqual(["service/queries.ts"]);
  });
});
