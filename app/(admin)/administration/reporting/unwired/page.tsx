import type { Metadata } from "next";
import { UnwiredConsole } from "@/features/admin/unwired/UnwiredConsole";
import {
  UNWIRED_HISTORY,
  UNWIRED_REPORT,
  UNWIRED_REPORT_PROBLEMS,
} from "@/features/admin/unwired/report-data";

export const metadata: Metadata = {
  title: "Unwired Work",
  description: "Purpose-built code that still needs its runtime wiring, ranked by implementation size.",
};

export default function UnwiredPage() {
  return (
    <div className="h-[calc(100dvh-2.5rem)] bg-textured">
      <UnwiredConsole
        report={UNWIRED_REPORT}
        history={UNWIRED_HISTORY}
        problems={UNWIRED_REPORT_PROBLEMS}
      />
    </div>
  );
}
