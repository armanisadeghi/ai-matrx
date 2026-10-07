"use client";

// features/education/kits/components/KitSourcesPanel.tsx
//
// A study kit's Sources, on its hub: each opens, a multi-source kit can take
// one out (its edge is archived, the Source stays saved), and "Add sources"
// opens THE one Source input (`SourceInput`, via the class page's
// `AddClassSourcesDialog`) — new material lands and is kept, existing records
// are filed as they are.
//
// An older single-anchor kit is PROMOTED on its first added Source
// (`promoteAnchorKit`): it gets its own kit record with the anchor as Source
// #1, and the page moves to the kit's new address.

import { useRef, useState } from "react";
import Link from "next/link";
import { FileText, Plus, X } from "lucide-react";
import { Button } from "@ai-matrx/design-system";
import { toast } from "@/lib/toast";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";
import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";
import { AddClassSourcesDialog } from "@/features/education/classes/components/AddClassSourcesDialog";
import { promoteAnchorKit, type StudyKit } from "../kitService";
import { KIT_TOKEN, addKitSource, removeKitSource, type KitSource } from "../kitScope";

export function KitSourcesPanel({
  kit,
  onChanged,
  onMoved,
}: {
  kit: StudyKit;
  /** Re-read the kit after a Source was added or removed. */
  onChanged: () => void;
  /** The kit was promoted to its own record — open it there. */
  onMoved: (kitId: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  // Promotion happens once, on the first filed Source of this dialog.
  const promoted = useRef<{ id: string; organizationId: string } | null>(null);
  const multi = kit.sourceType === KIT_TOKEN;

  async function fileSource(token: string, id: string, name: string): Promise<void> {
    let target = promoted.current;
    if (!target) {
      if (multi) {
        target = { id: kit.sourceId, organizationId: kit.organizationId ?? (await ensureOrgId(null)) };
      } else {
        const organizationId = await ensureOrgId(null);
        target = { id: await promoteAnchorKit(kit, organizationId), organizationId };
      }
      promoted.current = target;
    }
    await addKitSource(target, { type: token, id, title: name });
  }

  function closeDialog(open: boolean) {
    setAdding(open);
    if (open) return;
    const moved = promoted.current;
    promoted.current = null;
    if (moved && moved.id !== kit.sourceId) onMoved(moved.id);
    else onChanged();
  }

  async function remove(source: KitSource) {
    const ok = await confirm({
      title: `Remove ${source.title} from this kit?`,
      description: "The source stays saved. Study aids made from it stay in the kit.",
      confirmLabel: "Remove",
      variant: "destructive",
    });
    if (!ok) return;
    setBusy(source.edgeId);
    try {
      await removeKitSource(kit.sourceId, source);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove this source.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-labelledby="kit-sources-heading" className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 id="kit-sources-heading" className="text-sm font-semibold text-foreground">
          Sources <span className="font-normal text-muted-foreground">{kit.sources.length}</span>
        </h2>
        <Button size="sm" variant="outline" className="min-h-11 gap-1.5 sm:min-h-0" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" />
          Add sources
        </Button>
      </div>
      {kit.sources.length > 0 && (
        <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
          {kit.sources.map((source) => {
            const Icon = tryGetEntityInfo(source.type)?.Icon ?? FileText;
            return (
              <li key={source.edgeId} className="flex min-h-11 items-center gap-2 px-3 py-1.5">
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                {source.href ? (
                  <Link href={source.href} className="min-w-0 flex-1 truncate text-sm text-foreground hover:underline">
                    {source.title}
                  </Link>
                ) : (
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">{source.title}</span>
                )}
                {multi && (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Remove ${source.title}`}
                    title="Remove from kit"
                    disabled={busy === source.edgeId}
                    onClick={() => void remove(source)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <AddClassSourcesDialog
        open={adding}
        onOpenChange={closeDialog}
        target={{ id: `kit:${kit.sourceType}:${kit.sourceId}`, name: kit.title }}
        onFile={fileSource}
      />
    </section>
  );
}
