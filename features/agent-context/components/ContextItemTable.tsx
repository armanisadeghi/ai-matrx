"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ContextStatusBadge } from "./ContextStatusBadge";
import { FETCH_HINT_CONFIG } from "../constants";
import type { ContextItemManifest, ContextItemStatus } from "../types";

type Props = {
  items: ContextItemManifest[];
  onStatusChange?: (
    itemId: string,
    status: ContextItemStatus,
    note?: string,
  ) => void;
};

export function ContextItemTable({ items, onStatusChange }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <div className="border border-border rounded-lg overflow-auto">
      <Table>
        <TableHeader>
          <TableRow className="text-xs">
            <TableHead className="w-[200px]">Name</TableHead>
            <TableHead className="w-[140px]">Key</TableHead>
            <TableHead className="w-[120px]">Status</TableHead>
            <TableHead className="w-[100px]">Category</TableHead>
            <TableHead className="w-[80px] text-right">Size</TableHead>
            <TableHead className="w-[100px]">Fetch Hint</TableHead>
            <TableHead className="w-[100px]">Updated</TableHead>
            <TableHead className="w-[100px]">Review</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow
              key={item.id}
              className="cursor-pointer hover:bg-muted/50 text-xs"
              onClick={() =>
                startTransition(() =>
                  router.push(`/app-context/items/${item.id}`),
                )
              }
            >
              <TableCell className="font-medium truncate max-w-[200px]">
                {item.display_name}
              </TableCell>
              <TableCell className="font-mono text-muted-foreground truncate max-w-[140px]">
                {item.key}
              </TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
                <ContextStatusBadge
                  status={item.status}
                  size="sm"
                  interactive
                  onStatusChange={(status, note) =>
                    onStatusChange?.(item.id, status, note)
                  }
                />
              </TableCell>
              <TableCell>{item.category || "—"}</TableCell>
              <TableCell className="text-right">
                {item.char_count ? `${item.char_count.toLocaleString()}c` : "—"}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {FETCH_HINT_CONFIG[item.fetch_hint]?.label ?? item.fetch_hint}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {item.value_last_updated
                  ? new Date(item.value_last_updated).toLocaleDateString()
                  : "—"}
              </TableCell>
              <TableCell>
                {item.is_overdue_review ? (
                  <Badge variant="destructive" className="h-4 text-[10px] px-1">
                    Overdue
                  </Badge>
                ) : item.next_review_at ? (
                  <span className="text-muted-foreground">
                    {new Date(item.next_review_at).toLocaleDateString()}
                  </span>
                ) : (
                  "—"
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
