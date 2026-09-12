"use client";

import { useState, type ComponentType } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  MatrxDataTable,
  type MatrxColumnDef,
} from "@ai-matrx/design-system/data-table";
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

function LinkIcon({
  href,
  label,
  icon: Icon,
}: {
  href: string | null | undefined;
  label: string;
  icon: ComponentType<{ className?: string }>;
}) {
  if (!href) {
    return <Tooltip><TooltipTrigger asChild><span className="flex h-6 w-6 items-center justify-center text-muted-foreground/30"><Icon className="h-3.5 w-3.5" /></span></TooltipTrigger><TooltipContent side="top" className="text-xs">No {label} link set</TooltipContent></Tooltip>;
  }
  return <Tooltip><TooltipTrigger asChild><a href={href} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-primary"><Icon className="h-3.5 w-3.5" /></a></TooltipTrigger><TooltipContent side="top" className="max-w-[280px] break-all text-xs">{label}: {href}</TooltipContent></Tooltip>;
}

function ProviderLinks({ item }: { item: AiProvider }) {
  return <TooltipProvider delayDuration={200}><div className="flex items-center gap-0.5">
    {item.logo_url ? <Tooltip><TooltipTrigger asChild><img src={item.logo_url} alt="" className="h-5 w-5 shrink-0 rounded bg-muted object-contain" /></TooltipTrigger><TooltipContent side="top" className="text-xs">Logo</TooltipContent></Tooltip> : <Tooltip><TooltipTrigger asChild><span className="flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground/30"><ImageOff className="h-3 w-3" /></span></TooltipTrigger><TooltipContent side="top" className="text-xs">No logo set</TooltipContent></Tooltip>}
    <LinkIcon href={item.documentation_link} label="Documentation" icon={BookOpen} />
    <LinkIcon href={item.models_link} label="Models list" icon={Package} />
    <LinkIcon href={item.website_url} label="Website" icon={Globe} />
  </div></TooltipProvider>;
}

function RowActions({ item, onEdit, onDelete }: { item: AiProvider; onEdit: (item: AiProvider) => void; onDelete: (item: AiProvider) => void }) {
  const [pendingDelete, setPendingDelete] = useState(false);
  return <><div className="flex items-center gap-0.5">
    <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit" onClick={(event) => { event.stopPropagation(); onEdit(item); }}><Pencil className="h-3.5 w-3.5" /></Button>
    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-30" title={item.is_system ? "System providers cannot be deleted" : "Delete"} disabled={item.is_system} onClick={(event) => { event.stopPropagation(); setPendingDelete(true); }}><Trash2 className="h-3.5 w-3.5" /></Button>
  </div><AlertDialog open={pendingDelete} onOpenChange={setPendingDelete}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete &quot;{item.name}&quot;?</AlertDialogTitle><AlertDialogDescription>This will remove the provider &quot;{item.name}&quot;. Any AI models linked to it via their Provider Record field will lose that reference. This cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { setPendingDelete(false); onDelete(item); }}>Delete Provider</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></>;
}

export interface ProviderTableProps {
  providers: AiProvider[];
  isLoading: boolean;
  selectedId: string | null;
  onSelect: (provider: AiProvider) => void;
  onEdit: (provider: AiProvider) => void;
  onDelete: (provider: AiProvider) => void;
  onCreate: () => void;
}

export default function ProviderTable({ providers, isLoading, selectedId, onSelect, onEdit, onDelete, onCreate }: ProviderTableProps) {
  const columns: MatrxColumnDef<AiProvider>[] = [
    { accessorKey: "name", header: "Name", sortable: true, cell: (item) => <span className="block max-w-[190px] truncate font-medium" title={item.name}>{item.name}</span> },
    { accessorKey: "slug", header: "Slug", sortable: true, cell: (item) => <span className="block max-w-[130px] truncate font-mono text-muted-foreground" title={item.slug ? item.slug : ""}>{item.slug || "—"}</span> },
    { id: "links", header: "Links", cell: (item) => <ProviderLinks item={item} /> },
    { accessorKey: "is_system", header: "System", sortable: true, cell: (item) => item.is_system ? <Badge variant="outline" className="gap-1 border-border bg-muted text-xs text-muted-foreground"><Lock className="h-3 w-3" />System</Badge> : <span className="text-muted-foreground">—</span> },
  ];

  return <div className="flex h-full min-h-0 flex-col">
    <MatrxDataTable<AiProvider>
      data={providers}
      isLoading={isLoading}
      columns={columns}
      getRowId={(item) => item.id}
      pageSize={25}
      pageSizeOptions={[10, 25, 50, 100]}
      defaultSort={{ id: "name", direction: "asc" }}
      onRowOpen={onSelect}
      detail={{ enabled: false }}
      rowClassName={(item) => item.id === selectedId ? "bg-primary/10 hover:bg-primary/15" : undefined}
      emptyState={{ title: "No providers found", icon: <Building2 className="h-8 w-8" /> }}
      toolbar={{ leading: <div className="flex items-center gap-2"><h2 className="text-sm font-semibold">AI Providers</h2><Badge variant="outline" className="text-xs">{providers.length}</Badge></div>, actions: <Button size="sm" className="h-8 gap-1.5 px-2 text-xs" onClick={onCreate}><Plus className="h-3.5 w-3.5" />New Provider</Button> }}
      rowActions={(item) => <RowActions item={item} onEdit={onEdit} onDelete={onDelete} />}
      mobileCards={(item, _index, controls) => <article className={item.id === selectedId ? "space-y-2 rounded-md border border-primary/40 bg-primary/10 p-3" : "space-y-2 rounded-md border border-border p-3"}><div className="flex items-start justify-between gap-2"><div className="min-w-0"><button type="button" className="block max-w-full truncate text-left font-medium hover:underline" onClick={() => onSelect(item)}>{item.name}</button><p className="truncate font-mono text-xs text-muted-foreground">{item.slug || "—"}</p></div>{item.is_system ? <Badge variant="outline" className="shrink-0 gap-1 text-xs"><Lock className="h-3 w-3" />System</Badge> : null}</div><ProviderLinks item={item} /><div className="flex justify-end">{controls.actions}</div></article>}
    />
  </div>;
}
