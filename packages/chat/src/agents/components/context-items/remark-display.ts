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

export function remarkKindDisplay(kind: RemarkKind): { icon: LucideIcon; label: string } {
  return { icon: KIND_ICON[kind], label: remarkKindLabel(kind) };
}
