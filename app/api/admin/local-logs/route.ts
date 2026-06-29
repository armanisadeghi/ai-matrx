import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { createClient } from "@/utils/supabase/server";
import { checkIsSuperAdmin } from "@/utils/supabase/userSessionData";

/**
 * Dev-only: tail local Python server log files on the developer machine.
 * Paths use $HOME so they work without hardcoding a username. `turbopackIgnore`
 * keeps Turbopack from tracing the whole filesystem into the prod bundle.
 */
const LOCAL_LOG_FILES: Record<string, string> = {
  "local-python-run": path.join(
    /* turbopackIgnore: true */ process.env.HOME ?? "",
    "code/aidream/temp/logs/run_py.log",
  ),
  "local-python-dev": path.join(
    /* turbopackIgnore: true */ process.env.HOME ?? "",
    "code/aidream/temp/logs/aidreamdev.log",
  ),
};

/** Read the last `lines` lines from a file without loading the whole thing */
function readLastLines(
  fs: typeof import("node:fs"),
  filePath: string,
  lineCount: number,
): string {
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;

  if (fileSize === 0) return "";

  // Read up to ~4MB from the end; should be plenty for even 10k lines
  const chunkSize = Math.min(fileSize, 4 * 1024 * 1024);
  const buffer = Buffer.alloc(chunkSize);
  const fd = fs.openSync(filePath, "r");
  fs.readSync(fd, buffer, 0, chunkSize, fileSize - chunkSize);
  fs.closeSync(fd);

  const content = buffer.toString("utf8");
  const allLines = content.split("\n");

  // The first line in the chunk may be partial — drop it unless we read the whole file
  const lines = chunkSize < fileSize ? allLines.slice(1) : allLines;

  return lines.slice(-lineCount).join("\n");
}

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isAdmin = await checkIsSuperAdmin(supabase, user.id);
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const appKey = searchParams.get("app") ?? "local-python-run";
  const lines = Math.min(
    parseInt(searchParams.get("lines") ?? "200", 10),
    10000,
  );

  const logFile = LOCAL_LOG_FILES[appKey];
  if (!logFile) {
    return NextResponse.json(
      { error: `Unknown local app: ${appKey}` },
      { status: 400 },
    );
  }

  const fs = await import("node:fs");

  if (!fs.existsSync(logFile)) {
    return NextResponse.json({
      app: appKey,
      uuid: appKey,
      lines: 0,
      logs: "",
      fetched_at: new Date().toISOString(),
      warning: `Log file not found: ${logFile}`,
    });
  }

  const logs = readLastLines(fs, logFile, lines);

  return NextResponse.json({
    app: appKey,
    uuid: appKey,
    lines,
    logs,
    fetched_at: new Date().toISOString(),
  });
}
