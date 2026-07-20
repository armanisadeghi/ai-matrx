'use client';

/**
 * AssetsPanel — the W2-B asset library tab on /administration/cms-agents.
 *
 * Upload flows through the ONE canonical path: `fileHandler.upload(source,
 * { preset: "web", visibility: "public" })` → aidream POST /assets → durable
 * public CDN URL, then the metadata row is registered via /api/cms/assets
 * (`CmsAssetService.createAsset`). Bytes never touch the Next server.
 *
 * Delete is usage-guarded: the route live-scans pages/components and refuses
 * with the exact reference list while the asset is still used; the dialog
 * shows "what breaks" and offers an explicit force delete.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from "@/lib/toast";
import { fileHandler } from '@/features/files';
import { AssetInUseError, CmsAssetService } from '../../services/cmsService';
import type { AssetComponentUsage, AssetPageUsage, ClientAsset, ClientSite } from '../../types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    AlertTriangle,
    Check,
    Copy,
    FileText,
    Film,
    ImageIcon,
    Loader2,
    Music,
    Pencil,
    RefreshCw,
    Trash2,
    Upload,
    File as FileIcon,
} from 'lucide-react';

const TYPE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
    image: ImageIcon,
    video: Film,
    audio: Music,
    document: FileText,
    file: FileIcon,
};

function formatBytes(n: number | null): string {
    if (n == null) return '—';
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function fileTypeForMime(mime: string): string {
    const top = mime.split('/')[0];
    if (top === 'image' || top === 'video' || top === 'audio') return top;
    if (mime === 'application/pdf' || top === 'text') return 'document';
    return 'file';
}

interface DeleteState {
    asset: ClientAsset;
    usedInPages: AssetPageUsage[];
    usedInComponents: AssetComponentUsage[];
    /** false while we have not yet attempted (plain confirm); true after 409. */
    inUse: boolean;
}

export default function AssetsPanel({ sites }: { sites: ClientSite[] }) {
    const [siteId, setSiteId] = useState<string>(sites[0]?.id ?? '');
    const [assets, setAssets] = useState<ClientAsset[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [editing, setEditing] = useState<ClientAsset | null>(null);
    const [editAlt, setEditAlt] = useState('');
    const [deleteState, setDeleteState] = useState<DeleteState | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const site = useMemo(() => sites.find((s) => s.id === siteId), [sites, siteId]);

    const refresh = useCallback(async () => {
        if (!siteId) return;
        setIsLoading(true);
        try {
            const rows = await CmsAssetService.adminListAssets(siteId);
            setAssets(rows);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to load assets');
        } finally {
            setIsLoading(false);
        }
    }, [siteId]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const handleFilePicked = async (file: File) => {
        if (!siteId) return;
        setIsUploading(true);
        const tid = toast.loading(`Uploading ${file.name}…`);
        try {
            // ONE canonical byte path: assets pipeline, PUBLIC → durable CDN URL.
            const normalized = await fileHandler.upload(
                { kind: 'file', file },
                { preset: 'web', visibility: 'public', fileName: file.name },
            );
            const envelope = normalized.asset;
            // ORIGINAL first: the library references the untouched master (true
            // bytes/dimensions/transparency); preset renders stay on the envelope.
            const primary = envelope?.variants?.['original'] ?? envelope?.variants?.[envelope.primary_key];
            const cdnUrl = primary?.cdn_url ?? null;
            if (!envelope || !cdnUrl) {
                // Durability doctrine: never register a signed URL as a library asset.
                throw new Error(
                    'Upload succeeded but no durable CDN URL came back — the file was not persisted public.',
                );
            }
            const asset = await CmsAssetService.createAsset({
                siteId,
                fileId: envelope.file_id,
                filePath: cdnUrl,
                fileName: file.name,
                fileType: fileTypeForMime(file.type || primary?.mime_type || 'application/octet-stream'),
                mimeType: primary?.mime_type ?? file.type ?? null,
                fileSize: primary?.size_bytes ?? primary?.file_size ?? file.size,
                width: primary?.width ?? null,
                height: primary?.height ?? null,
            });
            toast.dismiss(tid);
            toast.success(`Asset '${asset.file_name}' added to ${site?.name ?? 'site'}`);
            refresh();
        } catch (err) {
            toast.dismiss(tid);
            toast.error(err instanceof Error ? err.message : 'Upload failed');
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleCopy = async (asset: ClientAsset) => {
        await navigator.clipboard.writeText(asset.file_path);
        setCopiedId(asset.id);
        setTimeout(() => setCopiedId((prev) => (prev === asset.id ? null : prev)), 1500);
    };

    const openEdit = (asset: ClientAsset) => {
        setEditing(asset);
        setEditAlt(asset.alt_text ?? '');
    };

    const saveEdit = async () => {
        if (!editing) return;
        try {
            const updated = await CmsAssetService.updateAsset(editing.id, { alt_text: editAlt || null });
            setAssets((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
            setEditing(null);
            toast.success('Alt text saved');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Update failed');
        }
    };

    const attemptDelete = async (asset: ClientAsset, force: boolean) => {
        setIsDeleting(true);
        try {
            await CmsAssetService.deleteAsset(asset.id, force);
            setDeleteState(null);
            setAssets((prev) => prev.filter((a) => a.id !== asset.id));
            toast.success(`Deleted '${asset.file_name}'${force ? ' (forced)' : ''}`);
        } catch (err) {
            if (err instanceof AssetInUseError) {
                // The guard fired — show exactly what breaks.
                setDeleteState({
                    asset,
                    usedInPages: err.usedInPages,
                    usedInComponents: err.usedInComponents,
                    inUse: true,
                });
            } else {
                toast.error(err instanceof Error ? err.message : 'Delete failed');
            }
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div className="h-full flex flex-col overflow-hidden">
            <div className="flex-none flex items-center gap-2 pb-2">
                <Select value={siteId} onValueChange={setSiteId}>
                    <SelectTrigger className="h-7 w-[180px] text-xs">
                        <SelectValue placeholder="Select site" />
                    </SelectTrigger>
                    <SelectContent>
                        {sites.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                                {s.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <div className="flex-1" />

                <Button variant="ghost" size="sm" onClick={refresh} className="h-7 gap-1.5 text-xs">
                    {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    Refresh
                </Button>
                <Button
                    size="sm"
                    className="h-7 gap-1.5 text-xs"
                    disabled={!siteId || isUploading}
                    onClick={() => fileInputRef.current?.click()}
                >
                    {isUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                    Upload
                </Button>
                <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleFilePicked(f);
                    }}
                />
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto">
                {assets.length === 0 && !isLoading ? (
                    <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground text-xs">
                        <ImageIcon className="h-8 w-8 opacity-40" />
                        No assets on {site?.name ?? 'this site'} yet. Upload one, or let an agent use the cms_asset tool.
                    </div>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 pb-4">
                        {assets.map((asset) => {
                            const Icon = TYPE_ICON[asset.file_type] ?? FileIcon;
                            const usedCount = asset.used_in_pages?.length ?? 0;
                            return (
                                <div
                                    key={asset.id}
                                    className="group rounded-lg border border-border bg-card overflow-hidden flex flex-col"
                                >
                                    <div className="aspect-square bg-muted/40 flex items-center justify-center overflow-hidden">
                                        {asset.file_type === 'image' ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                                src={asset.file_path}
                                                alt={asset.alt_text ?? asset.file_name}
                                                className="h-full w-full object-cover"
                                                loading="lazy"
                                            />
                                        ) : (
                                            <Icon className="h-8 w-8 text-muted-foreground" />
                                        )}
                                    </div>
                                    <div className="p-2 flex flex-col gap-1">
                                        <div className="text-xs font-medium truncate" title={asset.file_name}>
                                            {asset.file_name}
                                        </div>
                                        <div className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                                            <span>{formatBytes(asset.file_size)}</span>
                                            {asset.width && asset.height ? (
                                                <span>
                                                    {asset.width}×{asset.height}
                                                </span>
                                            ) : null}
                                            {usedCount > 0 && (
                                                <span className="text-emerald-600 dark:text-emerald-400">
                                                    {usedCount} page{usedCount === 1 ? '' : 's'}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-0.5 pt-0.5">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-6 w-6 p-0"
                                                title="Copy durable URL"
                                                onClick={() => handleCopy(asset)}
                                            >
                                                {copiedId === asset.id ? (
                                                    <Check className="h-3 w-3 text-emerald-500" />
                                                ) : (
                                                    <Copy className="h-3 w-3" />
                                                )}
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-6 w-6 p-0"
                                                title="Edit alt text"
                                                onClick={() => openEdit(asset)}
                                            >
                                                <Pencil className="h-3 w-3" />
                                            </Button>
                                            <div className="flex-1" />
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                                                title="Delete (usage-guarded)"
                                                onClick={() =>
                                                    setDeleteState({
                                                        asset,
                                                        usedInPages: [],
                                                        usedInComponents: [],
                                                        inUse: false,
                                                    })
                                                }
                                            >
                                                <Trash2 className="h-3 w-3" />
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Alt-text editor */}
            <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle className="text-sm">Edit alt text</DialogTitle>
                        <DialogDescription className="text-xs truncate">{editing?.file_name}</DialogDescription>
                    </DialogHeader>
                    <Input
                        value={editAlt}
                        onChange={(e) => setEditAlt(e.target.value)}
                        placeholder="Describe the image for accessibility/SEO"
                        className="text-xs"
                    />
                    <DialogFooter>
                        <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
                            Cancel
                        </Button>
                        <Button size="sm" onClick={saveEdit}>
                            Save
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete with usage guard */}
            <Dialog open={!!deleteState} onOpenChange={(open) => !open && setDeleteState(null)}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-sm flex items-center gap-2">
                            {deleteState?.inUse && <AlertTriangle className="h-4 w-4 text-amber-500" />}
                            Delete asset
                        </DialogTitle>
                        <DialogDescription className="text-xs truncate">
                            {deleteState?.asset.file_name}
                        </DialogDescription>
                    </DialogHeader>
                    {deleteState?.inUse ? (
                        <div className="text-xs space-y-2">
                            <p className="text-destructive font-medium">
                                This asset is still referenced by live/draft content. Deleting it will break:
                            </p>
                            {deleteState.usedInPages.length > 0 && (
                                <ul className="list-disc pl-5 space-y-0.5">
                                    {deleteState.usedInPages.map((u) => (
                                        <li key={u.page_id}>
                                            Page <span className="font-mono">{u.slug}</span>
                                            {u.title ? ` — ${u.title}` : ''}{' '}
                                            <span className="text-muted-foreground">({u.fields.join(', ')})</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            {deleteState.usedInComponents.length > 0 && (
                                <ul className="list-disc pl-5 space-y-0.5">
                                    {deleteState.usedInComponents.map((u) => (
                                        <li key={u.component_id}>
                                            Component <span className="font-mono">{u.component_type}</span>
                                            {u.name ? ` — ${u.name}` : ''}{' '}
                                            <span className="text-muted-foreground">({u.fields.join(', ')})</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    ) : (
                        <p className="text-xs text-muted-foreground">
                            The delete is usage-guarded: if any page or component still references this asset, the
                            delete is refused and the references are listed here first.
                        </p>
                    )}
                    <DialogFooter>
                        <Button variant="ghost" size="sm" onClick={() => setDeleteState(null)}>
                            Cancel
                        </Button>
                        {deleteState?.inUse ? (
                            <Button
                                variant="destructive"
                                size="sm"
                                disabled={isDeleting}
                                onClick={() => deleteState && attemptDelete(deleteState.asset, true)}
                            >
                                {isDeleting && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                                Force delete anyway
                            </Button>
                        ) : (
                            <Button
                                variant="destructive"
                                size="sm"
                                disabled={isDeleting}
                                onClick={() => deleteState && attemptDelete(deleteState.asset, false)}
                            >
                                {isDeleting && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                                Delete
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
