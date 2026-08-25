import type { Metadata } from "next";
import { LintDebtConsole } from "@/features/admin/lint-debt/LintDebtConsole";
import {
  LINT_DEBT_HISTORY,
  LINT_DEBT_REPORT,
  LINT_DEBT_REPORT_PROBLEMS,
} from "@/features/admin/lint-debt/report-data";

/**
 * ESLint debt scoreboard.
 *
 * Reads the COMMITTED snapshot (`scripts/lint-debt/report.json`), not a live
 * scan — a full ESLint pass over this repo takes minutes, which is not a page
 * load, and a static import is the only thing that reliably resolves inside a
 * Vercel function. Same pattern as /administration/reporting/dead-ends and the
 * shape doctor. Refresh with `pnpm check:lint-debt:write` and commit; the
 * console shows the scan's age and screams when it goes stale. The snapshot is
 * validated, not cast — see `report-data.ts`.
 *
 * Admin gating is the (admin) layout's job — never re-gate here.
 */

export const metadata: Metadata = {
  title: "ESLint debt",
  description:
    "Every error-severity ESLint finding in the repo — classified bug / correctness / doctrine / style, ranked, openable, with a one-click repair brief per finding.",
};

export default function LintDebtPage() {
  return (
    <div className="h-[calc(100dvh-2.5rem)] bg-textured">
      <LintDebtConsole
        report={LINT_DEBT_REPORT}
        history={LINT_DEBT_HISTORY}
        problems={LINT_DEBT_REPORT_PROBLEMS}
      />
    </div>
  );
}
