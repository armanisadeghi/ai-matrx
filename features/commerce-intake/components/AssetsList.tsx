"use client";

/**
 * AssetsList — every intake asset of the org, newest first (complete read
 * via `readAllRows`). Mobile-first card list: tap opens the asset detail,
 * the Camera action jumps back into capture on that asset (mid-item resume
 * from the list side).
 */

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera, ChevronRight, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CaptureThumb } from "@/features/media-capture/components/CaptureThumb";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectEffectiveOrganizationId } from "@/lib/redux/slices/appContextSlice";
import {
  selectAccessToken,
  selectAuthReady,
  selectUserId,
} from "@/lib/redux/selectors/userSelectors";
import { toast } from "@/lib/toast";

import type { IntakeAsset } from "../types";
import {
  listAllAssets,
  listArtifactsForAssets,
  listPrimaryQrForAssets,
} from "../service";

interface ListRow {
  asset: IntakeAsset;
  qrCode: string | null;
  thumbFileId: string | null;
  artifactCount: number;
}

/**
 * A persisted organization can hydrate before the Supabase session does.
 * Never let that stale org context launch a PostgREST request as `anon`.
 */
export function intakeAssetsLoadKey(input: {
  authReady: boolean;
  userId: string | null;
  accessToken: string | null;
  organizationId: string | null;
}): string | null {
  const { authReady, userId, accessToken, organizationId } = input;
  if (!authReady || !userId || !accessToken || !organizationId) return null;
  return `${userId}:${organizationId}`;
}

export function AssetsList() {
  const organizationId = useAppSelector(selectEffectiveOrganizationId);
  const authReady = useAppSelector(selectAuthReady);
  const userId = useAppSelector(selectUserId);
  const accessToken = useAppSelector(selectAccessToken);
  const loadKey = intakeAssetsLoadKey({
    authReady,
    userId,
    accessToken,
    organizationId,
  });
  const router = useRouter();
  const [rows, setRows] = useState<ListRow[] | null>(null);

  useEffect(() => {
    if (!loadKey || !organizationId) return;
    let cancelled = false;
    void (async () => {
      try {
        const assets = await listAllAssets(organizationId);
        const ids = assets.map((a) => a.id);
        const [artifactsByAsset, qrByAsset] = await Promise.all([
          listArtifactsForAssets(ids),
          listPrimaryQrForAssets(ids),
        ]);
        if (cancelled) return;
        setRows(
          assets.map((asset) => {
            const artifacts = artifactsByAsset.get(asset.id) ?? [];
            const featured = asset.featuredArtifactId
              ? artifacts.find((a) => a.id === asset.featuredArtifactId)
              : undefined;
            const firstPhoto = artifacts.find(
              (a) => a.kind === "photo" && !a.isDelineator && a.fileId,
            );
            return {
              asset,
              qrCode: qrByAsset.get(asset.id) ?? null,
              thumbFileId: featured?.fileId ?? firstPhoto?.fileId ?? null,
              artifactCount: artifacts.length,
            };
          }),
        );
      } catch (err) {
        console.error("[commerce-intake] assets list load failed", err);
        toast.error("Could not load the intake assets.");
        if (!cancelled) setRows([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadKey, organizationId]);

  if (rows === null) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <p className="text-sm text-muted-foreground">
          No intake assets yet — start capturing.
        </p>
        <Button className="h-10" onClick={() => router.push("/commerce/intake")}>
          <Camera className="mr-1.5 h-4 w-4" />
          Open capture
        </Button>
      </div>
    );
  }

  return (
    <ul className="mx-auto w-full max-w-2xl space-y-2 pb-safe">
      {rows.map(({ asset, qrCode, thumbFileId, artifactCount }) => (
        <li
          key={asset.id}
          className="flex items-center gap-3 rounded-xl border border-border bg-card p-2"
        >
          <Link
            href={`/commerce/intake/assets/${asset.id}`}
            className="flex min-w-0 flex-1 items-center gap-3"
          >
            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-muted">
              {thumbFileId ? (
                <CaptureThumb fileId={thumbFileId} alt={qrCode ?? "Item"} />
              ) : (
                <span className="flex h-full w-full items-center justify-center">
                  <Camera className="h-5 w-5 text-muted-foreground" />
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                {qrCode ?? "No code"}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {asset.pipelineState.replace(/_/g, " ")} · {artifactCount}{" "}
                file{artifactCount === 1 ? "" : "s"}
              </p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 shrink-0"
            aria-label="Capture more on this item"
            onClick={() => router.push(`/commerce/intake?asset=${asset.id}`)}
          >
            <Camera className="h-4 w-4" />
          </Button>
        </li>
      ))}
    </ul>
  );
}
