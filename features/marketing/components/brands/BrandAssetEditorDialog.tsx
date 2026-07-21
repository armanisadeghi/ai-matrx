"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useCreateBrandAsset,
  useUpdateBrandAsset,
} from "@/features/marketing/data/hooks";
import {
  BRAND_ASSET_KIND_LABELS,
  BRAND_ASSET_KINDS,
  type BrandAsset,
  type BrandAssetKind,
} from "@/features/marketing/types";
import { extractErrorMessage } from "@/utils/errors";

/** Kinds that don't reference a file/URL (value lives in notes/data). */
const URL_OPTIONAL_KINDS: readonly BrandAssetKind[] = ["color", "font"];

/**
 * The ONE brand-asset editor — create (manual, by URL) and edit expose EVERY
 * user-editable asset field. Discovered promotion lives in the discovery
 * inbox; this dialog covers manual curation.
 */
export function BrandAssetEditorDialog({
  open,
  onOpenChange,
  brandId,
  organizationId,
  asset,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandId: string;
  organizationId: string;
  /** null = create mode */
  asset: BrandAsset | null;
}) {
  return (
    <BrandAssetEditorDialogBody
      key={`${open}:${asset?.id ?? "new"}:${asset?.version ?? 0}`}
      open={open}
      onOpenChange={onOpenChange}
      brandId={brandId}
      organizationId={organizationId}
      asset={asset}
    />
  );
}

function BrandAssetEditorDialogBody({
  open,
  onOpenChange,
  brandId,
  organizationId,
  asset,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandId: string;
  organizationId: string;
  asset: BrandAsset | null;
}) {
  const createMutation = useCreateBrandAsset();
  const updateMutation = useUpdateBrandAsset();
  const [kind, setKind] = useState<BrandAssetKind>(() =>
    asset ? (asset.kind as BrandAssetKind) : "logo",
  );
  const [sourceUrl, setSourceUrl] = useState(asset?.source_url ?? "");
  const [title, setTitle] = useState(asset?.title ?? "");
  const [notes, setNotes] = useState(asset?.notes ?? "");
  const [isPrimary, setIsPrimary] = useState(asset?.is_primary ?? false);
  const busy = createMutation.isPending || updateMutation.isPending;
  const urlOptional = URL_OPTIONAL_KINDS.includes(kind);

  const save = async () => {
    const trimmedUrl = sourceUrl.trim();
    if (!trimmedUrl && !urlOptional && !asset?.file_id) {
      toast.error("This asset kind needs a source URL.");
      return;
    }
    if (kind === "other" && !title.trim()) {
      toast.error("Other assets need a custom title.");
      return;
    }
    try {
      if (asset) {
        await updateMutation.mutateAsync({
          assetId: asset.id,
          expectedVersion: asset.version,
          patch: {
            kind,
            source_url: trimmedUrl || null,
            title: title.trim() || null,
            notes: notes.trim() || null,
            is_primary: isPrimary,
          },
        });
        toast.success("Asset saved");
      } else {
        await createMutation.mutateAsync({
          organizationId,
          brandId,
          kind,
          sourceUrl: trimmedUrl || null,
          title: title.trim() || null,
          notes: notes.trim() || null,
          isPrimary,
        });
        toast.success("Asset added");
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(asset ? "Could not save asset" : "Could not add asset", {
        description: extractErrorMessage(error),
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{asset ? "Edit asset" : "Add asset"}</DialogTitle>
          <DialogDescription>
            Confirmed brand assets reference the brand's own public URLs.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Type</Label>
              <Select
                value={kind}
                onValueChange={(value) => setKind(value as BrandAssetKind)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BRAND_ASSET_KINDS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {BRAND_ASSET_KIND_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="asset-title" className="text-xs">
                Title
              </Label>
              <Input
                id="asset-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Primary logo"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="asset-source-url" className="text-xs">
              Source URL{urlOptional ? " (optional for this kind)" : ""}
            </Label>
            <Input
              id="asset-source-url"
              value={sourceUrl}
              onChange={(event) => setSourceUrl(event.target.value)}
              placeholder="https://example.com/logo.svg"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="asset-notes" className="text-xs">
              Notes
            </Label>
            <Textarea
              id="asset-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              minHeight={56}
              maxHeight={140}
              placeholder="Usage notes, color values, font names…"
            />
          </div>

          <div className="flex items-center justify-between rounded-md border border-border p-2.5">
            <div>
              <p className="text-xs font-medium">Primary asset</p>
              <p className="text-[10px] leading-4 text-muted-foreground">
                The default choice when one asset of this kind is needed.
              </p>
            </div>
            <Switch checked={isPrimary} onCheckedChange={setIsPrimary} />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button disabled={busy} onClick={() => void save()}>
            {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            {asset ? "Save asset" : "Add asset"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
