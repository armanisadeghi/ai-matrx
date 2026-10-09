import type { Metadata } from "next";
import {
  CheckFindingsConsole,
  type FrontendAcceptInfo,
} from "@/features/admin/check-findings/CheckFindingsConsole";
import { frontendAcceptInfo as readAcceptInfo } from "@/scripts/findings/accept-info.mjs";

/**
 * Check findings — every static check's last run and its findings, read LIVE from the checks
 * store (ops.proof_check / ops.check_run / ops.check_item). Feature: features/admin/check-findings.
 *
 * The server half only hands the console what matrx-frontend's accept adapters are
 * (from accept-rules.json, the same declaration `pnpm findings accept` uses), so "Mark OK"
 * can say when a check has no accept command instead of offering one that refuses.
 *
 * Admin gating is the (admin) layout's job — never re-gate here.
 */

export const metadata: Metadata = {
  title: "Check findings",
  description:
    "Every check's last run, verdict, scan completeness, open findings and their age — drill into one check's findings by work unit, and mark a false alarm OK once with a reason.",
};

// Read from the pure accept-info module, never the CLI registry (see scripts/findings/accept-info.mjs).
function frontendAcceptInfo(): Record<string, FrontendAcceptInfo> {
  return readAcceptInfo() as Record<string, FrontendAcceptInfo>;
}

export default function CheckFindingsPage() {
  return (
    <div className="h-[calc(100dvh-2.5rem)] bg-textured">
      <CheckFindingsConsole frontendAccept={frontendAcceptInfo()} />
    </div>
  );
}
