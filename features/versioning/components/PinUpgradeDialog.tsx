'use client';

/**
 * PinUpgradeDialog — Modal for upgrading an app's prompt version pin.
 *
 * Lists available prompt versions, shows a diff preview between current
 * pin and selected version, and confirms the upgrade.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { X, AlertTriangle, Loader2, ArrowRight, Check } from 'lucide-react';
import { useVersionHistory } from '../hooks/useVersionHistory';
import { VersionDiffView } from './VersionDiffView';
import type { VersionHistoryItem, PinVersionResult } from '../types';

interface PinUpgradeDialogProps {
    isOpen: boolean;
    onClose: () => void;
    appId: string;
    appName: string;
    promptId: string;
    currentPinnedVersion: number;
    /** Called with the new pinned version number after successful upgrade */
    onUpgraded: (result: PinVersionResult) => void;
    /** The actual pin function */
    pinToVersion: (appId: string, versionId: string) => Promise<PinVersionResult | null>;
    pinning: boolean;
}

export function PinUpgradeDialog({
    isOpen,
    onClose,
    appId,
    appName,
    promptId,
    currentPinnedVersion,
    onUpgraded,
    pinToVersion,
    pinning,
}: PinUpgradeDialogProps) {
    const {
        versions,
        loading: versionsLoading,
        diff,
        diffLoading,
        loadDiff,
        clearDiff,
    } = useVersionHistory({
        entityType: 'prompt',
        entityId: promptId,
        autoFetch: isOpen,
    });

    const [selectedVersion, setSelectedVersion] = useState<VersionHistoryItem | null>(null);
    const [showConfirm, setShowConfirm] = useState(false);

    // Reset state when dialog opens/closes
    useEffect(() => {
        if (!isOpen) {
            setSelectedVersion(null);
            setShowConfirm(false);
            clearDiff();
        }
    }, [isOpen, clearDiff]);

    // Auto-load diff when a version is selected
    const handleSelectVersion = useCallback(
        async (v: VersionHistoryItem) => {
            setSelectedVersion(v);
            setShowConfirm(false);
            clearDiff();
            if (v.version_number !== currentPinnedVersion) {
                await loadDiff(currentPinnedVersion, v.version_number);
            }
        },
        [currentPinnedVersion, loadDiff, clearDiff]
    );

    // Confirm and execute pin upgrade
    const handleConfirmUpgrade = useCallback(async () => {
        if (!selectedVersion) return;
        const result = await pinToVersion(appId, selectedVersion.version_id);
        if (result?.success) {
            onUpgraded(result);
            onClose();
        }
    }, [selectedVersion, appId, pinToVersion, onUpgraded, onClose]);

    if (!isOpen) return null;

    // Only show versions newer than the current pin
    const newerVersions = versions.filter((v) => v.version_number > currentPinnedVersion);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/50" onClick={onClose} />

            {/* Dialog */}
            <div className="relative w-full max-w-2xl max-h-[85dvh] bg-background border border-border rounded-lg shadow-xl flex flex-col animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
                    <div>
                        <h2 className="text-base font-semibold">Upgrade Prompt Pin</h2>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            {appName} — currently pinned to v{currentPinnedVersion}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-md hover:bg-muted">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto p-5 space-y-4">
                    {/* Warning */}
                    <div className="flex items-start gap-2 p-3 bg-amber-500/5 border border-amber-500/20 rounded-md">
                        <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-700 dark:text-amber-400">
                            Upgrading the pin may break the app if prompt variables changed.
                            Review the diff below before confirming.
                        </p>
                    </div>

                    {/* Version selection */}
                    {versionsLoading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                        </div>
                    ) : newerVersions.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-8">
                            No newer versions available. The app is already on the latest version.
                        </p>
                    ) : (
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">
                                Select target version
                            </label>
                            <div className="space-y-1 max-h-40 overflow-auto">
                                {newerVersions.map((v) => {
                                    const isSelected = selectedVersion?.version_id === v.version_id;
                                    return (
                                        <button
                                            key={v.version_id}
                                            onClick={() => handleSelectVersion(v)}
                                            className={`flex items-center justify-between w-full px-3 py-2 rounded-md text-left text-sm transition-colors ${
                                                isSelected
                                                    ? 'bg-primary/10 border border-primary/30'
                                                    : 'hover:bg-muted border border-transparent'
                                            }`}
                                        >
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium">v{v.version_number}</span>
                                                {v === newerVersions[0] && (
                                                    <span className="text-[10px] font-medium bg-green-500/10 text-green-500 px-1.5 py-0.5 rounded-full">
                                                        LATEST
                                                    </span>
                                                )}
                                                {v.change_note && (
                                                    <span className="text-xs text-muted-foreground truncate">
                                                        — {v.change_note}
                                                    </span>
                                                )}
                                            </div>
                                            {isSelected && <Check className="w-4 h-4 text-primary" />}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Diff preview */}
                    {selectedVersion && (
                        <div className="mt-4">
                            {diffLoading ? (
                                <div className="flex items-center justify-center py-8">
                                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                                    <span className="ml-2 text-sm text-muted-foreground">
                                        Loading diff...
                                    </span>
                                </div>
                            ) : diff ? (
                                <VersionDiffView
                                    diff={diff}
                                    versionA={currentPinnedVersion}
                                    versionB={selectedVersion.version_number}
                                />
                            ) : null}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-5 py-3 border-t border-border flex-shrink-0">
                    <button
                        onClick={onClose}
                        className="text-sm text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-md hover:bg-muted"
                    >
                        Cancel
                    </button>

                    {selectedVersion && (
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">
                                v{currentPinnedVersion}
                            </span>
                            <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-xs font-medium">
                                v{selectedVersion.version_number}
                            </span>
                            <button
                                onClick={() => {
                                    if (showConfirm) {
                                        handleConfirmUpgrade();
                                    } else {
                                        setShowConfirm(true);
                                    }
                                }}
                                disabled={pinning}
                                className={`text-sm px-4 py-1.5 rounded-md transition-colors ${
                                    showConfirm
                                        ? 'bg-amber-500 text-white hover:bg-amber-600'
                                        : 'bg-primary text-primary-foreground hover:bg-primary/90'
                                } disabled:opacity-50`}
                            >
                                {pinning ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : showConfirm ? (
                                    'Confirm Upgrade'
                                ) : (
                                    'Upgrade Pin'
                                )}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
