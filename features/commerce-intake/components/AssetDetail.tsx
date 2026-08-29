"use client";

/**
 * AssetDetail — one intake asset: media strip, notes (guarded autosave),
 * identifiers, and the GENERIC EDITABLE ROWS over `intake_asset.attributes`
 * (§2 policy 5 — one generic editable-rows component makes every
 * agent-written value human-correctable; reuses the prototype-proven
 * `EditableRows` + `CommitField` primitives rather than bespoke forms).
 *
 * "Reprocess" here is the SAME `pipeline_state='captured'` status write the
 * capture surface makes — the transition IS the contract (§2 policy 3).
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, QrCode, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Textarea } from "@/components/ui/textarea";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { CaptureThumb } from "@/features/media-capture/components/CaptureThumb";
import {
  CommitField,
  EditableRows,
  PanelSection,
} from "@/features/product-capture/components/pipeline/panel-primitives";
import { toast } from "@/lib/toast";

import type { AssetIdentifier, IntakeArtifact, IntakeAsset } from "../types";
import {
  finishAsset,
  listAssetArtifacts,
  listIdentifiers,
  loadAsset,
  replaceIdentifier,
  setAssetAttributes,
  setAssetNotes,
} from "../service";
import { PrintLabelDialog } from "../labels/components/PrintLabelDialog";

interface AttributeRow {
  key: string;
  value: string;
}

export function AssetDetail({ assetId }: { assetId: string }) {
  const router = useRouter();
  const [asset, setAsset] = useState<IntakeAsset | null>(null);
  const [artifacts, setArtifacts] = useState<IntakeArtifact[]>([]);
  const [identifiers, setIdentifiers] = useState<AssetIdentifier[]>([]);
  const [loading, setLoading] = useState(true);
  const [notesDraft, setNotesDraft] = useState("");
  const [saving, setSaving] = useState(false);
  // A Retry that cannot succeed is the lie the access gate exists to kill, so
  // the gate's retry re-runs the real load rather than re-rendering the shell.
  const [reloadNonce, setReloadNonce] = useState(0);
  const [printOpen, setPrintOpen] = useState(false);
  const [pendingRetire, setPendingRetire] = useState<AssetIdentifier | null>(
    null,
  );

  const reloadIdentifiers = useCallback(async () => {
    try {
      setIdentifiers(await listIdentifiers(assetId));
    } catch (err) {
      console.error("[commerce-intake] identifier reload failed", err);
    }
  }, [assetId]);

  const assetRef = useRef<IntakeAsset | null>(null);
  const adopt = useCallback((next: IntakeAsset | null) => {
    assetRef.current = next;
    setAsset(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const [loaded, arts, ids] = await Promise.all([
          loadAsset(assetId),
          listAssetArtifacts(assetId),
          listIdentifiers(assetId),
        ]);
        if (cancelled) return;
        adopt(loaded);
        setNotesDraft(loaded?.notes ?? "");
        setArtifacts(arts);
        setIdentifiers(ids);
      } catch (err) {
        console.error("[commerce-intake] asset load failed", err);
        toast.error("Could not load the asset.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [assetId, adopt, reloadNonce]);

  const saveNotes = useCallback(async () => {
    const current = assetRef.current;
    if (!current || notesDraft === current.notes) return;
    setSaving(true);
    try {
      adopt(await setAssetNotes(current, notesDraft));
    } catch (err) {
      console.error("[commerce-intake] notes save failed", err);
      toast.error("Could not save the notes.");
    } finally {
      setSaving(false);
    }
  }, [notesDraft, adopt]);

  const saveAttributes = useCallback(
    async (rows: AttributeRow[]) => {
      const current = assetRef.current;
      if (!current) return;
      const attributes: Record<string, string> = {};
      for (const row of rows) {
        const k = row.key.trim();
        if (k) attributes[k] = row.value;
      }
      // Optimistic local rows keep typing fluid; the CAS save adopts the row
      // that lands.
      adopt({ ...current, attributes });
      try {
        adopt(await setAssetAttributes(current, attributes));
      } catch (err) {
        console.error("[commerce-intake] attributes save failed", err);
        toast.error("Could not save the attributes.");
      }
    },
    [adopt],
  );

  const reprocess = useCallback(async () => {
    const current = assetRef.current;
    if (!current) return;
    setSaving(true);
    try {
      // Notes-flush-before-close (§2 policy 4), then the status write —
      // nothing else. The transition IS the handoff (§2 policy 3).
      if (notesDraft !== current.notes) {
        adopt(await setAssetNotes(current, notesDraft));
      }
      const closed = await finishAsset(assetRef.current ?? current);
      adopt(closed);
      toast.success("Marked captured — the pipeline picks it up from here.");
    } catch (err) {
      console.error("[commerce-intake] reprocess failed", err);
      toast.error("Could not mark the asset captured.");
    } finally {
      setSaving(false);
    }
  }, [notesDraft, adopt]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!asset) {
    // A zero-row read is denied / deleted / never-existed / signed-out, and
    // this surface cannot tell them apart — it used to assert the second one.
    // The gate asks the platform and says the true one, with a way forward.
    return (
      <AccessGate
        token="commerce_intake_asset"
        id={assetId}
        onRetry={() => setReloadNonce((n) => n + 1)}
        fallbackHref="/commerce/intake/assets"
        fallbackLabel="All intake assets"
      />
    );
  }

  const attributeRows: AttributeRow[] = Object.entries(asset.attributes).map(
    ([key, value]) => ({ key, value }),
  );

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 pb-safe">
      {/* Media strip */}
      {artifacts.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto rounded-xl border border-border bg-card p-2">
          {artifacts.map((a) =>
            a.fileId ? (
              <div
                key={a.id}
                className="relative h-20 w-16 shrink-0 overflow-hidden rounded bg-muted"
              >
                <CaptureThumb fileId={a.fileId} alt={`${a.kind} artifact`} />
              </div>
            ) : null,
          )}
        </div>
      )}

      <PanelSection
        title="Item"
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              onClick={() => setPrintOpen(true)}
            >
              <QrCode className="mr-1.5 h-4 w-4" />
              Print label
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              onClick={() =>
                router.push(`/commerce/intake?asset=${asset.id}`)
              }
            >
              <Camera className="mr-1.5 h-4 w-4" />
              Capture
            </Button>
            <Button
              size="sm"
              className="h-9"
              disabled={saving}
              onClick={() => void reprocess()}
            >
              <RotateCw className="mr-1.5 h-4 w-4" />
              {asset.pipelineState === "captured" ? "Reprocess" : "Mark captured"}
            </Button>
          </div>
        }
      >
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">QR code</dt>
          <dd>{asset.qrCode ?? "—"}</dd>
          <dt className="text-muted-foreground">State</dt>
          <dd>{asset.pipelineState.replace(/_/g, " ")}</dd>
          <dt className="text-muted-foreground">Tracking</dt>
          <dd>
            {asset.trackingMode}
            {asset.trackingMode === "lot" ? ` × ${asset.quantity}` : ""}
          </dd>
          <dt className="text-muted-foreground">Composition</dt>
          <dd>{asset.composition ?? "—"}</dd>
        </dl>
      </PanelSection>

      <PanelSection title="Notes">
        <Textarea
          value={notesDraft}
          rows={4}
          onChange={(e) => setNotesDraft(e.target.value)}
          onBlur={() => void saveNotes()}
          placeholder="Receiver notes — transcripts converge here."
          className="text-base"
        />
        {saving && (
          <p className="text-xs text-muted-foreground">Saving…</p>
        )}
      </PanelSection>

      <PanelSection title="Identifiers">
        {identifiers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No identifiers yet — scan a QR or type a serial in capture.
          </p>
        ) : (
          <ul className="space-y-1 text-sm">
            {identifiers.map((i) => (
              <li key={i.id} className="flex items-center gap-2">
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                  {i.kind}
                </span>
                <span className="min-w-0 truncate font-mono">{i.value}</span>
                {i.isPrimary && !i.replacedAt && (
                  <span className="text-xs text-primary">primary</span>
                )}
                {i.replacedAt ? (
                  <span className="text-xs text-muted-foreground">
                    replaced
                  </span>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto h-6 px-2 text-xs text-muted-foreground"
                    onClick={() => setPendingRetire(i)}
                  >
                    Retire
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </PanelSection>

      <PanelSection title="Attributes">
        <EditableRows<AttributeRow>
          rows={attributeRows}
          onChange={(rows) => void saveAttributes(rows)}
          makeNew={() => ({ key: "", value: "" })}
          addLabel="Add attribute"
          empty="No attributes yet — agents fill these; correct anything here."
          render={(row, update) => (
            <div className="flex min-w-0 gap-2">
              <CommitField
                value={row.key}
                placeholder="Name"
                onCommit={(key) => update({ ...row, key })}
                className="max-w-[40%]"
              />
              <CommitField
                value={row.value}
                placeholder="Value"
                onCommit={(value) => update({ ...row, value })}
              />
            </div>
          )}
        />
      </PanelSection>

      <PrintLabelDialog
        asset={asset}
        identifiers={identifiers}
        open={printOpen}
        onOpenChange={setPrintOpen}
        onChanged={() => void reloadIdentifiers()}
      />

      {/* Replacement lifecycle: retire stamps replaced_at + reason — never a
          delete; the value's slot in the live unique index frees up. */}
      <ConfirmDialog
        open={pendingRetire !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRetire(null);
        }}
        title="Retire this identifier?"
        description={
          pendingRetire
            ? `"${pendingRetire.value}" is marked replaced (kept for history, no longer live). A new label or ID can then take its place.`
            : ""
        }
        confirmLabel="Retire"
        onConfirm={async () => {
          if (!pendingRetire) return;
          try {
            await replaceIdentifier(pendingRetire.id, "retired_manually");
            setPendingRetire(null);
            await reloadIdentifiers();
            toast.success("Identifier retired.");
          } catch (err) {
            console.error("[commerce-intake] identifier retire failed", err);
            toast.error("Could not retire the identifier.");
          }
        }}
      />
    </div>
  );
}
