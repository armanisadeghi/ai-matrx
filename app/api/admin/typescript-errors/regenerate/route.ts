import { NextRequest, NextResponse } from "next/server";
import * as ts from "typescript";
import * as fs from "fs";
import * as path from "path";
import { createClient } from "@/utils/supabase/server";
import { requireSuperAdmin } from "@/utils/auth/adminUtils";

// The check runs a full TS program over the codebase — Node runtime + long budget.
export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

interface TypeScriptError {
  file: string | null;
  line: number | null;
  column: number | null;
  message: string;
  code: number;
}

const PREFERRED_TSCONFIGS = ["tsconfig.typecheck.json", "tsconfig.json"];

/**
 * Resolve which tsconfig to use for a given codebase root.
 * Prefers the canonical typecheck config so results match `pnpm type-check`.
 */
function resolveTsconfig(root: string): string | null {
  for (const name of PREFERRED_TSCONFIGS) {
    const p = path.join(root, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/**
 * Validate that a path is an existing directory that looks like a TS codebase.
 * Returns a human-readable reason when invalid.
 */
function validateCodebaseRoot(
  root: string,
): { ok: true; tsconfig: string } | { ok: false; reason: string } {
  if (!root || !path.isAbsolute(root)) {
    return {
      ok: false,
      reason: "Provide an absolute path to the codebase directory.",
    };
  }
  let stat: fs.Stats;
  try {
    stat = fs.statSync(root);
  } catch {
    return {
      ok: false,
      reason: `Directory not found on the server running this app: ${root}. The check runs where the code physically lives — run the app on a machine that has the repo, or point to a checkout on this server.`,
    };
  }
  if (!stat.isDirectory()) {
    return { ok: false, reason: `Not a directory: ${root}` };
  }
  const tsconfig = resolveTsconfig(root);
  if (!tsconfig) {
    return {
      ok: false,
      reason: `No tsconfig.typecheck.json or tsconfig.json found in ${root}`,
    };
  }
  return { ok: true, tsconfig };
}

function runTypeCheck(root: string, tsconfigPath: string): TypeScriptError[] {
  const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  if (configFile.error) {
    throw new Error(
      ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n"),
    );
  }

  const parsedConfig = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    root,
    undefined,
    tsconfigPath,
  );

  // Normalize options so a diagnostics-only program never emits config noise
  // (e.g. TS5074 "--incremental can only be specified..." from noEmit + incremental).
  const options: ts.CompilerOptions = {
    ...parsedConfig.options,
    noEmit: true,
    incremental: false,
    composite: false,
    tsBuildInfoFile: undefined,
  };

  const program = ts.createProgram({
    rootNames: parsedConfig.fileNames,
    options,
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);

  const errors: TypeScriptError[] = [];
  for (const d of diagnostics) {
    // Skip global/config diagnostics with no file (project-level noise, not real type errors).
    if (!d.file || d.start === undefined) continue;
    const fileName = d.file.fileName;
    // Skip library/generated noise.
    if (fileName.includes("/node_modules/") || fileName.includes("/.next/"))
      continue;
    const { line, character } = ts.getLineAndCharacterOfPosition(
      d.file,
      d.start,
    );
    errors.push({
      file: path.relative(root, fileName) || fileName,
      line: line + 1,
      column: character + 1,
      message: ts.flattenDiagnosticMessageText(d.messageText, "\n"),
      code: d.code,
    });
  }
  return errors;
}

/** GET → default codebase path suggestion for the UI to prefill. */
export async function GET() {
  try {
    await requireSuperAdmin();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Access denied";
    const status = message.includes("Unauthorized") ? 401 : 403;
    return NextResponse.json({ error: message }, { status });
  }

  const defaultPath = process.cwd();
  const check = validateCodebaseRoot(defaultPath);
  return NextResponse.json({
    defaultPath,
    valid: check.ok,
    tsconfig: check.ok ? path.basename(check.tsconfig) : null,
    reason: check.ok ? null : check.reason,
  });
}

/** POST → run the check against the given codebase path and persist the run. */
export async function POST(request: NextRequest) {
  let userId: string;
  try {
    userId = await requireSuperAdmin();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Access denied";
    const status = message.includes("Unauthorized") ? 401 : 403;
    return NextResponse.json({ error: message }, { status });
  }

  const body = await request.json().catch(() => ({}));
  const codebasePath: string = (body?.codebasePath || process.cwd()).trim();

  const valid = validateCodebaseRoot(codebasePath);
  if (!valid.ok) {
    return NextResponse.json({ error: valid.reason }, { status: 400 });
  }

  const supabase = await createClient();
  const startedAt = Date.now();

  try {
    const errors = runTypeCheck(codebasePath, valid.tsconfig);
    const durationMs = Date.now() - startedAt;

    const { data, error: dbError } = await supabase
      .from("ts_check_runs")
      .insert({
        ran_by: userId,
        codebase_path: codebasePath,
        tsconfig: path.basename(valid.tsconfig),
        status: "success",
        error_count: errors.length,
        duration_ms: durationMs,
        errors,
      })
      .select("id, ran_at, error_count, duration_ms, tsconfig, codebase_path")
      .single();

    if (dbError) {
      throw new Error(
        `Check ran (${errors.length} errors) but saving to the database failed: ${dbError.message}`,
      );
    }

    return NextResponse.json({
      success: true,
      run: data,
      count: errors.length,
      errors,
    });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const message = error instanceof Error ? error.message : "Unknown error";

    // Record the failed run so the UI reflects the database truth.
    await supabase.from("ts_check_runs").insert({
      ran_by: userId,
      codebase_path: codebasePath,
      tsconfig: path.basename(valid.tsconfig),
      status: "error",
      error_count: 0,
      duration_ms: durationMs,
      message,
      errors: [],
    });

    console.error("Error regenerating TypeScript errors:", error);
    return NextResponse.json(
      { error: "Failed to regenerate TypeScript errors", details: message },
      { status: 500 },
    );
  }
}
