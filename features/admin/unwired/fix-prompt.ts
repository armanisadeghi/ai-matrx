import type { UnwiredFinding } from "@/scripts/unwired/types";

export function finishWiringPrompt(finding: UnwiredFinding): string {
  return [
    "Finish this purpose-built but unwired artifact. It is UNFINISHED WORK, never a disposal candidate.",
    "",
    "Read /Users/armanisadeghi/code/common-docs/policies/unfinished-work-alarm.md first.",
    "",
    `Repository: ${finding.repository}`,
    `Source:     ${finding.file}:${finding.line}`,
    `Symbol:     ${finding.symbol}`,
    `Detector:   ${finding.detector}`,
    `Size:       ${finding.lines} implicated implementation line(s)`,
    "",
    `Evidence: ${finding.evidence}`,
    `Intent:   ${finding.intent}`,
    `Remains:  ${finding.remains}`,
    "",
    "Before changing code, hunt the artifact's intent across common-docs (especially VISION.md and FEATURE.md), every repo's feature directories and routes, db/matrx_orm.yaml and generated models, docs/handoffs, .matrx task lists, and FOUND_DEFECTS.md. A one-repo name search is not enough.",
    "",
    "Finish the runtime wiring, add an end-to-end proof that reaches it through the real host/page/scheduler, update the owning FEATURE.md, then run `pnpm check:unwired` from matrx-frontend and refresh the scoreboard with `pnpm check:unwired:write`.",
    "",
    "Never recommend discarding the artifact based on this finding. Only Arman can name purpose-built work unwanted, in writing.",
  ].join("\n");
}
