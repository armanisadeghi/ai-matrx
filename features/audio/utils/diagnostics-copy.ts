/**
 * diagnostics-copy — pure builders for the mic-diagnostics Copy / Copy-for-AI
 * pair (agent-copy doctrine: shortening and shaping live in pure
 * `(data, opts) => …` builders, never in the chrome and never inline at the
 * callsite).
 *
 * THE MISSION for this surface: the user clicks Copy here because their
 * microphone is broken and they want AI help fixing it RIGHT NOW. So the
 * payload leads with the rendered error text verbatim, mirrors the four status
 * cards the panel opens with, and carries every detected issue with its
 * suggested solution — not a raw device dump.
 *
 * Device ids are deliberately dropped: they are opaque per-origin hashes that
 * mean nothing to an agent, while the device LABEL is what the user sees.
 */

import type {
  DiagnosticIssue,
  DiagnosticResult,
} from "./microphone-diagnostics";

export interface DiagnosticsCopyInput {
  diagnostics: DiagnosticResult;
  /** The red error box, exactly as rendered. */
  error?: string | null;
  errorCode?: string | null;
  /** Live state of the "Test Microphone" button. */
  testResult: "idle" | "testing" | "success" | "failed";
  canFix: boolean;
  fixInstructions: string[];
}

/** The four status cards the panel leads with — the page's KPIs. */
export function diagnosticsKpis(
  diagnostics: DiagnosticResult,
): Record<string, string> {
  return {
    browser_support: diagnostics.hasMediaDevices ? "Supported" : "Not Supported",
    secure_connection: diagnostics.isSecureContext ? "HTTPS" : "HTTP (Insecure)",
    permission_status:
      diagnostics.permissionState === "prompt"
        ? "Not Requested"
        : diagnostics.permissionState,
    microphones_found: `${diagnostics.availableDevices.length} device(s)`,
  };
}

function issueLine(issue: DiagnosticIssue): string {
  return `[${issue.severity}] ${issue.message} — ${issue.solution}`;
}

/** Human flavor: what the panel says, in reading order. */
export function diagnosticsHumanSummary(input: DiagnosticsCopyInput): string {
  const { diagnostics, error, errorCode, testResult, fixInstructions } = input;
  const kpis = diagnosticsKpis(diagnostics);
  const lines: string[] = [];

  if (error) {
    lines.push("Error Occurred");
    lines.push(error);
    if (errorCode) lines.push(`Code: ${errorCode}`);
    lines.push("");
  }

  lines.push("System status");
  lines.push(`Browser Support: ${kpis.browser_support}`);
  lines.push(`Secure Connection: ${kpis.secure_connection}`);
  lines.push(`Permission Status: ${kpis.permission_status}`);
  lines.push(`Microphone Found: ${kpis.microphones_found}`);
  lines.push("");

  const browser = diagnostics.browserInfo;
  lines.push(
    `Browser: ${browser.name} ${browser.version}${browser.isMobile ? " (Mobile)" : ""}`,
  );
  lines.push("");

  if (diagnostics.issues.length > 0) {
    lines.push(`Issues Detected (${diagnostics.issues.length})`);
    for (const issue of diagnostics.issues) lines.push(issueLine(issue));
    lines.push("");
  }

  if (fixInstructions.length > 0) {
    lines.push("How to Fix");
    for (const instruction of fixInstructions) {
      lines.push(instruction.replace(/\*\*/g, ""));
    }
    lines.push("");
  }

  if (diagnostics.recommendations.length > 0) {
    lines.push("Additional Recommendations");
    for (const rec of diagnostics.recommendations) lines.push(`• ${rec}`);
    lines.push("");
  }

  lines.push(`Microphone test: ${testResult}`);
  return lines.join("\n").trim();
}

/** Agent data — the rendered panel converted to structured data. */
export function diagnosticsAgentData(
  input: DiagnosticsCopyInput,
): Record<string, unknown> {
  const { diagnostics, error, errorCode, testResult, canFix, fixInstructions } =
    input;
  return {
    error: error ? { message: error, code: errorCode ?? null } : null,
    status: diagnosticsKpis(diagnostics),
    browser: diagnostics.browserInfo,
    capabilities: {
      has_media_devices: diagnostics.hasMediaDevices,
      has_get_user_media: diagnostics.hasGetUserMedia,
      is_secure_context: diagnostics.isSecureContext,
      can_request_permission: diagnostics.canRequestPermission,
      permission_state: diagnostics.permissionState,
    },
    // Labels only — device ids are opaque per-origin hashes, useless to an agent.
    devices: diagnostics.availableDevices.map((device) => ({
      kind: device.kind,
      label: device.label || "(label hidden until permission granted)",
    })),
    issues: diagnostics.issues,
    user_fixable: canFix,
    fix_instructions: fixInstructions,
    recommendations: diagnostics.recommendations,
    microphone_test: testResult,
  };
}

/**
 * The "with prompt" sibling variant (canonical: Error Inspector). This panel
 * has exactly one obvious next action — fix the mic — so the faithful payload
 * is wrapped in a repair brief rather than left for the user to write.
 */
export function diagnosticsRepairPrompt(input: DiagnosticsCopyInput): string {
  const issueCount = input.diagnostics.issues.length;
  const headline = input.error
    ? `I hit this microphone error: ${input.error}`
    : issueCount > 0
      ? `My microphone diagnostics report ${issueCount} issue(s).`
      : "My microphone diagnostics look clean but audio still is not working.";

  return [
    headline,
    "",
    "Below is the full diagnostic panel as I see it. Tell me, step by step, what to do on THIS browser and OS to fix it. If the problem is not user-fixable, say so plainly and explain what has to change.",
    "",
    "<microphone_diagnostics>",
    diagnosticsHumanSummary(input),
    "</microphone_diagnostics>",
    "",
    "Start with the single most likely cause, then give the exact clicks.",
  ].join("\n");
}
