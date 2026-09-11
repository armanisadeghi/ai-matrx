/**
 * GET /api/sandbox/[id]/version-health
 *
 * Ownership-gated image freshness for one sandbox. The upstream /drift report
 * compares Docker image IDs; configured template_version and an image tag alone
 * cannot establish whether an instance is current.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  lookupSandboxAndOrchestrator,
  orchestratorJsonHeaders,
} from "@/lib/sandbox/orchestrator-routing";
import {
  buildSandboxVersionHealth,
  parseDriftBoxes,
} from "@/lib/sandbox/version-health";
import type { SandboxVersionHealth } from "@/types/sandbox";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const lookup = await lookupSandboxAndOrchestrator(id);
  if (lookup.ok === false) {
    return NextResponse.json({ error: lookup.error }, { status: lookup.status });
  }

  const headers = orchestratorJsonHeaders(lookup.orchestrator);
  let driftResponse: Response;
  try {
    driftResponse = await fetch(`${lookup.orchestrator.url}/drift`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Freshness check could not reach the orchestrator", details: error instanceof Error ? error.message : String(error) },
      { status: 502 },
    );
  }

  if (driftResponse.status === 404 || driftResponse.status === 405) {
    const health: SandboxVersionHealth = {
      supported: false,
      sandbox_id: lookup.sandboxId,
      template: null,
      tier: lookup.orchestrator.tier,
      status: "unknown",
      reason: "This sandbox manager does not support image freshness checks yet.",
      running_image_id: null,
      running_version: null,
      current_image_id: null,
      current_version: null,
      current_image_available: false,
      can_migrate: false,
      manager_version: null,
      migration_action_reason: "This manager does not support image freshness checks yet.",
    };
    return NextResponse.json({ health });
  }

  if (!driftResponse.ok) {
    return NextResponse.json(
      { error: "Freshness check failed", upstream_status: driftResponse.status },
      { status: driftResponse.status >= 500 ? 502 : driftResponse.status },
    );
  }

  const driftPayload: unknown = await driftResponse.json().catch(() => null);
  const boxes = parseDriftBoxes(driftPayload);

  // The update button is only offered when this manager explicitly reports the
  // migrate door. A missing capability is an honest no-action state.
  let canMigrate = false;
  let managerVersion: string | null = null;
  let migrationActionReason: string | null = "The manager capability list has not been checked.";
  try {
    const surfaceResponse = await fetch(`${lookup.orchestrator.url}/api-surface`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    if (surfaceResponse.ok) {
      const surface: unknown = await surfaceResponse.json();
      if (typeof surface === "object" && surface !== null && typeof (surface as { version?: unknown }).version === "string") {
        managerVersion = (surface as { version: string }).version;
      }
      const routes =
        typeof surface === "object" && surface !== null && Array.isArray((surface as { routes?: unknown }).routes)
          ? (surface as { routes: Array<{ path?: unknown; methods?: unknown }> }).routes
          : [];
      canMigrate = routes.some(
        (route) =>
          route.path === "/sandboxes/{sandbox_id}/migrate" &&
          Array.isArray(route.methods) &&
          route.methods.includes("POST"),
      );
      migrationActionReason = canMigrate
        ? null
        : "This manager does not advertise an in-place image update action.";
    } else {
      migrationActionReason = `The manager capability list is unavailable (HTTP ${surfaceResponse.status}).`;
    }
  } catch (error) {
    migrationActionReason = `The manager capability list could not be checked: ${error instanceof Error ? error.message : String(error)}`;
  }

  return NextResponse.json({
    health: buildSandboxVersionHealth({
      sandboxId: lookup.sandboxId,
      tier: lookup.orchestrator.tier,
      instanceStatus: lookup.status,
      boxes,
      canMigrate,
      migrationActionReason,
      managerVersion,
    }),
  });
}
