/**
 * How a staged remark (instance-resources/remarks.ts) shows as a chip: its
 * kind's icon + label, and the short quote as the title. One place, read by the
 * composer chips and the user-bubble card.
 */

import {
  CircleCheck,
  ListChecks,
  MessageSquareQuote,
  MousePointerClick,
  PencilLine,
  type LucideIcon,
} from "lucide-react";
import {
  remarkKindLabel,
  type RemarkKind,
} from "../../redux/execution-system/instance-resources/remarks";

const KIND_ICON: Record<RemarkKind, LucideIcon> = {
  comment: MessageSquareQuote,
  choice: CircleCheck,
  edit: PencilLine,
  answers: ListChecks,
  interaction: MousePointerClick,
};

export function remarkKindDisplay(
  kind: RemarkKind,
  /** An edit made by interacting with a shape (a ticked box) shows as an interaction. */
  editOrigin?: "text" | "choice" | "kind" | null,
): { icon: LucideIcon; label: string } {
  const icon = kind === "edit" && editOrigin === "kind" ? MousePointerClick : KIND_ICON[kind];
  return { icon, label: remarkKindLabel(kind) };
}
