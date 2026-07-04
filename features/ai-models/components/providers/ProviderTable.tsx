"use client";

import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Pencil,
  Trash2,
  Plus,
  Building2,
  Lock,
  BookOpen,
  Package,
  Globe,
  ImageOff,
} from "lucide-react";
import type { AiProvider } from "../../types";

// ─── Compact link icons (docs / models / website / logo) ──────────────────
// The full URLs aren't worth table width — the thing an admin actually needs
// at a glance is "does this provider have a docs/models/website link, and can
// I jump to it" — so these render as small icon buttons, muted when unset.

function LinkIcon({
  href,
  label,
  icon: Icon,
}: {
  href: string | null | undefined;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  if (!href) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="h-6 w-6 flex items-center justify-center text-muted-foreground/30">
            <Icon className="h-3.5 w-3.5" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          No {label} link set
        </TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="h-6 w-6 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-primary transition-colors"
        >
          <Icon className="h-3.5 w-3.5" />
        </a>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs max-w-[280px] break-all">
        {label}: {href}
      </TooltipContent>
    </Tooltip>
  );
}

function ProviderLinks({ item }: { item: AiProvider }) {
  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex items-center gap-0.5">
        {item.logo_url ? (
          <Tooltip>
            <TooltipTrigger asChild>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.logo_url}
                alt=""
                className="h-5 w-5 rounded object-contain bg-muted shrink-0"
              />
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              Logo
            </TooltipContent>
          </Tooltip>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="h-5 w-5 flex items-center justify-center text-muted-foreground/30 shrink-0">
                <ImageOff className="h-3 w-3" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              No logo set
            </TooltipContent>
          </Tooltip>
        )}
        <LinkIcon href={item.documentation_link} label="Documentation" icon={BookOpen} />
        <LinkIcon href={item.models_link} label="Models list" icon={Package} />
        <LinkIcon href={item.website_url} label="Website" icon={Globe} />
      </div>
    </TooltipProvider>
  );
}

// ─── Row actions ────────────────────────────────────────────────────────────

interface RowActionsProps {
  item: AiProvider;
  onEdit: (item: AiProvider) => void;
  onDelete: (item: AiProvider) => void;
}

function RowActions({ item, onEdit, onDelete }: RowActionsProps) {
  const [pendingDelete, setPendingDelete] = useState(false);

  return (
    <>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          title="Edit"
          onClick={(e) => {
            e.stopPropagation();
            onEdit(item);
          }}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive/10 disabled:opacity-30 disabled:pointer-events-none disabled:hover:bg-transparent"
          title={
            item.is_system
              ? "System providers cannot be deleted"
              : "Delete"
          }
          disabled={item.is_system}
          onClick={(e) => {
            e.stopPropagation();
            setPendingDelete(true);
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <AlertDialog open={pendingDelete} onOpenChange={setPendingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &quot;{item.name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the provider &quot;{item.name}&quot;. Any AI
              models linked to it via their Provider Record field will lose
              that reference. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setPendingDelete(false);
                onDelete(item);
              }}
            >
              Delete Provider
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export interface ProviderTableProps {
  providers: AiProvider[];
  isLoading: boolean;
  selectedId: string | null;
  onSelect: (provider: AiProvider) => void;
  onEdit: (provider: AiProvider) => void;
  onDelete: (provider: AiProvider) => void;
  onCreate: () => void;
}

export default function ProviderTable({
  providers,
  isLoading,
  selectedId,
  onSelect,
  onEdit,
  onDelete,
  onCreate,
}: ProviderTableProps) {
  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header row */}
      <div className="flex items-center justify-between shrink-0 px-3 py-2 border-b bg-card">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">AI Providers</h2>
          <Badge variant="outline" className="text-xs">
            {providers.length}
          </Badge>
        </div>
        <Button
          size="sm"
          className="h-7 px-2 text-xs gap-1.5"
          onClick={onCreate}
        >
          <Plus className="h-3.5 w-3.5" />
          New Provider
        </Button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto min-h-0">
        <table className="w-full caption-bottom text-xs border-collapse">
          <thead className="sticky top-0 z-10 bg-card border-b border-border">
            <tr className="h-8">
              <th className="w-[200px] min-w-[160px] px-2 py-1.5 text-left text-xs font-semibold text-muted-foreground">
                Name
              </th>
              <th className="w-[140px] min-w-[110px] px-2 py-1.5 text-left text-xs font-semibold text-muted-foreground">
                Slug
              </th>
              <th className="w-[140px] min-w-[130px] px-2 py-1.5 text-left text-xs font-semibold text-muted-foreground">
                Links
              </th>
              <th className="w-[90px] min-w-[80px] px-2 py-1.5 text-left text-xs font-semibold text-muted-foreground">
                System
              </th>
              <th className="w-[90px] min-w-[80px] px-2 py-1.5 text-right text-xs font-semibold text-muted-foreground pr-3">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="[&_tr:last-child]:border-0">
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="h-9 border-b border-border">
                  <td className="px-2 py-1.5">
                    <Skeleton className="h-4 w-full" />
                  </td>
                  <td className="px-2 py-1.5">
                    <Skeleton className="h-4 w-full" />
                  </td>
                  <td className="px-2 py-1.5">
                    <Skeleton className="h-4 w-full" />
                  </td>
                  <td className="px-2 py-1.5">
                    <Skeleton className="h-4 w-12" />
                  </td>
                  <td className="px-2 py-1.5">
                    <Skeleton className="h-4 w-16" />
                  </td>
                </tr>
              ))
            ) : providers.length === 0 ? (
              <tr>
                <td colSpan={5} className="h-32 text-center p-2">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Building2 className="h-10 w-10 opacity-30" />
                    <p className="text-sm">No providers found</p>
                  </div>
                </td>
              </tr>
            ) : (
              providers.map((item, idx) => (
                <tr
                  key={item.id}
                  className={`group h-9 border-b border-border cursor-pointer transition-colors ${
                    selectedId === item.id
                      ? "bg-primary/10 hover:bg-primary/15"
                      : idx % 2 === 0
                        ? "hover:bg-muted/50"
                        : "bg-muted/20 hover:bg-muted/50"
                  }`}
                  onClick={() => onSelect(item)}
                >
                  <td className="py-1 px-2 align-middle">
                    <span
                      className="text-xs font-medium truncate block max-w-[190px]"
                      title={item.name}
                    >
                      {item.name}
                    </span>
                  </td>
                  <td className="py-1 px-2 align-middle">
                    <span
                      className="text-xs font-mono text-muted-foreground truncate block max-w-[130px]"
                      title={item.slug ?? ""}
                    >
                      {item.slug || "—"}
                    </span>
                  </td>
                  <td className="py-1 px-2 align-middle">
                    <ProviderLinks item={item} />
                  </td>
                  <td className="py-1 px-2 align-middle">
                    {item.is_system ? (
                      <Badge
                        variant="outline"
                        className="text-xs gap-1 bg-muted text-muted-foreground border-border"
                      >
                        <Lock className="h-3 w-3" />
                        System
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                  <td className="py-1 px-2 align-middle text-right">
                    <RowActions item={item} onEdit={onEdit} onDelete={onDelete} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
