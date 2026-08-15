/**
 * The urgency band's icon — one map, so the chip, the card and the manager
 * can never disagree about what "urgent" looks like.
 *
 * A distinct icon per band is not decoration: colour alone is not a signal
 * (greyscale, colour blindness, a dark-mode wash), so every band carries a
 * shape as well as a tint, and the card carries the word too.
 */

import { AlertOctagon, AlertTriangle, Lightbulb } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { AssistUrgency } from "../types";

export const ASSIST_URGENCY_ICON: Record<AssistUrgency, LucideIcon> = {
  normal: Lightbulb,
  elevated: AlertTriangle,
  urgent: AlertOctagon,
};
