"use client";

import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  Loader2,
  AlertTriangle,
  FileText,
  Stars
} from "lucide-react";
import type { DocStatus } from "@/features/rag/types/library";

const STATUS_CONFIG: Record<
  DocStatus,
  {
    label: string;
    variant: "success" | "info" | "warning" | "error" | "secondary" | "outline";
    Icon: React.ComponentType<{ className?: string }>;
    title: string;
  }
> = {
  ready: {
    label: "Ready",
    variant: "success",
    Icon: CheckCircle2,
    title: "All chunks have embeddings — fully searchable.",
  },
  embedding: {
    label: "Embedding",
    variant: "info",
    Icon: Stars,
    title: "Chunks are generated; embeddings are still flowing in.",
  },
  chunking: {
    label: "Chunking",
    variant: "info",
    Icon: Loader2,
    title: "Pages are persisted; chunking is in progress.",
  },
  extracted: {
    label: "Extracted",
    variant: "warning",
    Icon: FileText,
    title:
      "Pages persisted but no chunks yet — extraction succeeded, chunking did not run or was paused.",
  },
  pending: {
    label: "Pending",
    variant: "error",
    Icon: AlertTriangle,
    title:
      "No pages persisted — ingestion likely failed early. Re-process this document.",
  },
  unknown: {
    label: "Unknown",
    variant: "outline",
    Icon: AlertTriangle,
    title: "Status could not be derived.",
  },
};

export function StatusBadge({ status }: { status: DocStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.unknown;
  const Icon = cfg.Icon;
  return (
    <Badge variant={cfg.variant} title={cfg.title} className="gap-1">
      <Icon className="h-3 w-3" />
      <span>{cfg.label}</span>
    </Badge>
  );
}
