import { NextRequest, NextResponse } from "next/server";
import {
  lookupSandboxAndOrchestrator,
  orchestratorJsonHeaders,
} from "@/lib/sandbox/orchestrator-routing";
import { extractErrorMessage } from "@/utils/errors";

/**
 * POST /api/sandbox/[id]/exec
 *
 * Buffered exec — single JSON response at end-of-command. For long-running
 * commands use POST /api/sandbox/[id]/exec/stream instead.
 *
 * Body:
 *   { command: string, timeout?: number, cwd?: string,
 *     env?: Record<string,string>, stdin?: string }
 *
 * Tier routing is automatic: the sandbox row's `config.tier` determines which
 * orchestrator we forward to.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const lookup = await lookupSandboxAndOrchestrator(id);
    if (lookup.ok === false) {
      const { error, status } = lookup;
      return NextResponse.json({ error }, { status });
    }

    if (!["ready", "running"].includes(lookup.status)) {
      return NextResponse.json(
        { error: `Sandbox is not running (status: ${lookup.status})` },
        { status: 409 },
      );
    }

    const body = await request.json();
    const { command, timeout, cwd, env, stdin } = body;

    if (!command || typeof command !== "string" || !command.trim()) {
      return NextResponse.json(
        { error: "command is required" },
        { status: 400 },
      );
    }

    if (command.length > 10000) {
      return NextResponse.json(
        { error: "Command exceeds maximum length of 10000 characters" },
        { status: 400 },
      );
    }

    const execPayload: Record<string, unknown> = {
      command,
      timeout: Math.min(Math.max(timeout || 30, 1), 600),
    };
    if (cwd && typeof cwd === "string") execPayload.cwd = cwd;
    if (env && typeof env === "object") execPayload.env = env;
    if (typeof stdin === "string") execPayload.stdin = stdin;

    try {
      const resp = await fetch(
        `${lookup.orchestrator.url}/sandboxes/${lookup.sandboxId}/exec`,
        {
          method: "POST",
          headers: orchestratorJsonHeaders(lookup.orchestrator),
          body: JSON.stringify(execPayload),
        },
      );

      if (!resp.ok) {
        const errBody = await resp.text();
        console.error("Orchestrator exec failed:", resp.status, errBody);
        return NextResponse.json(
          { error: "Command execution failed", details: errBody },
          { status: resp.status >= 500 ? 502 : resp.status },
        );
      }

      const result = await resp.json();
      return NextResponse.json(result);
    } catch (fetchError) {
      console.error("Orchestrator connection failed:", fetchError);
      return NextResponse.json(
        { error: "Sandbox orchestrator is not reachable" },
        { status: 502 },
      );
    }
  } catch (error) {
    console.error("Sandbox exec API error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: extractErrorMessage(error, "Unknown error"),
      },
      { status: 500 },
    );
  }
}
