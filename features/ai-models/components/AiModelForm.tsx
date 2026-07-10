'use client';

import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Trash2 } from 'lucide-react';
import type { AiModelFormData, AiProvider, AiModel } from '../types';

interface AiModelFormProps {
    data: AiModelFormData;
    providers: AiProvider[];
    allModels: AiModel[];
    isNew: boolean;
    saving: boolean;
    isDirty?: boolean;
    onChange: (data: AiModelFormData) => void;
    onDelete?: () => Promise<void>;
}

function FormField({
    label,
    children,
    required,
    description,
}: {
    label: string;
    children: React.ReactNode;
    required?: boolean;
    description?: string;
}) {
    return (
        <div className="space-y-1">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {label}
                {required && <span className="text-destructive ml-1">*</span>}
            </Label>
            {children}
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
    );
}

export default function AiModelForm({
    data,
    providers,
    allModels,
    isNew,
    saving,
    isDirty = true,
    onChange,
    onDelete,
}: AiModelFormProps) {
    const set = (key: keyof AiModelFormData) => (
        e: React.ChangeEvent<HTMLInputElement>
    ) => onChange({ ...data, [key]: e.target.value });

    const toggle = (key: keyof AiModelFormData) => (checked: boolean) =>
        onChange({ ...data, [key]: checked });

    // Fallback target options — every non-deprecated, non-self model grouped
    // by provider for easy scanning. Used by the Mid + Guest fallback Selects.
    const fallbackGroups = React.useMemo(() => {
        const groups: Record<string, AiModel[]> = {};
        for (const m of allModels) {
            // Exclude self (no point pointing a row at itself) + deprecated rows
            if (m.name === data.name) continue;
            if (m.is_deprecated) continue;
            const key = m.maker || "Other";
            if (!groups[key]) groups[key] = [];
            groups[key].push(m);
        }
        for (const key of Object.keys(groups)) {
            groups[key].sort((a, b) =>
                (a.common_name || a.name || "").localeCompare(b.common_name || b.name || ""),
            );
        }
        return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
    }, [allModels, data.name]);

    const fallbackTargetLabel = (id: string): string => {
        if (!id) return "";
        const m = allModels.find((x) => x.id === id);
        if (!m) return id;
        return m.common_name || m.name || id;
    };

    return (
        <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
                <FormField label="Name" required>
                    <Input
                        value={data.name}
                        onChange={set('name')}
                        placeholder="e.g. claude-sonnet-4-6"
                        className="h-8 text-sm font-mono"
                    />
                </FormField>
                <FormField label="Common Name">
                    <Input
                        value={data.common_name}
                        onChange={set('common_name')}
                        placeholder="e.g. Claude Sonnet 4.6"
                        className="h-8 text-sm"
                    />
                </FormField>
            </div>

            <FormField label="Provider" description="ai.provider record (provider_id FK) — the model's maker. The old free-text provider column is dropped and derived, never edited.">
                <Select
                    value={data.provider_id || undefined}
                    onValueChange={(v) => {
                        onChange({ ...data, provider_id: v === '__none__' ? '' : v });
                    }}
                >
                    <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Select provider..." />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="__none__">— none —</SelectItem>
                        {providers.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                                {p.name ?? p.id}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </FormField>

            <div className="grid grid-cols-2 gap-3">
                <FormField label="Context Window" description="Total tokens (input + output)">
                    <Input
                        type="number"
                        value={data.context_window}
                        onChange={set('context_window')}
                        placeholder="e.g. 200000"
                        className="h-8 text-sm"
                    />
                </FormField>
                <FormField label="Max Tokens" description="Maximum output tokens">
                    <Input
                        type="number"
                        value={data.max_tokens}
                        onChange={set('max_tokens')}
                        placeholder="e.g. 64000"
                        className="h-8 text-sm"
                    />
                </FormField>
            </div>

            <div className="border rounded-md p-3 space-y-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Flags</p>
                <div className="grid grid-cols-3 gap-4">
                    <div className="flex items-center gap-2">
                        <Switch
                            checked={!!data.is_deprecated}
                            onCheckedChange={toggle('is_deprecated')}
                            id="is_deprecated"
                        />
                        <Label htmlFor="is_deprecated" className="text-sm cursor-pointer">
                            Deprecated
                        </Label>
                    </div>
                    <div className="flex items-center gap-2">
                        <Switch
                            checked={!!data.is_primary}
                            onCheckedChange={toggle('is_primary')}
                            id="is_primary"
                        />
                        <Label htmlFor="is_primary" className="text-sm cursor-pointer">
                            Primary
                        </Label>
                    </div>
                    <div className="flex items-center gap-2">
                        <Switch
                            checked={!!data.is_premium}
                            onCheckedChange={toggle('is_premium')}
                            id="is_premium"
                        />
                        <Label htmlFor="is_premium" className="text-sm cursor-pointer">
                            Premium
                        </Label>
                    </div>
                </div>
            </div>

            {/* Curated ratings — drive the user-facing model pickers
                ($-tier + speed dots). 1-5 scale; 6 is the "5+" outlier band. */}
            <div className="border rounded-md p-3 space-y-3">
                <div className="flex items-baseline justify-between">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Ratings
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                        1-5 scale; 6 renders as the &quot;5+&quot; band in pickers.
                    </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <FormField label="Cost Rating" description="Renders as $ … $$$$$ (+)">
                        <Select
                            value={data.cost_rating || "__none__"}
                            onValueChange={(v) =>
                                onChange({ ...data, cost_rating: v === "__none__" ? "" : v })
                            }
                        >
                            <SelectTrigger className="h-8 text-sm">
                                <SelectValue placeholder="No rating" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__none__" className="italic text-muted-foreground">
                                    — no rating —
                                </SelectItem>
                                {["1", "2", "3", "4", "5", "6"].map((v) => (
                                    <SelectItem key={v} value={v} className="text-xs">
                                        {v === "6" ? "5+ (outlier band)" : v}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </FormField>
                    <FormField label="Speed Rating" description="Renders as 5-dot speed scale">
                        <Select
                            value={data.speed_rating || "__none__"}
                            onValueChange={(v) =>
                                onChange({ ...data, speed_rating: v === "__none__" ? "" : v })
                            }
                        >
                            <SelectTrigger className="h-8 text-sm">
                                <SelectValue placeholder="No rating" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__none__" className="italic text-muted-foreground">
                                    — no rating —
                                </SelectItem>
                                {["1", "2", "3", "4", "5", "6"].map((v) => (
                                    <SelectItem key={v} value={v} className="text-xs">
                                        {v === "6" ? "5+ (outlier band)" : v}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </FormField>
                </div>
            </div>

            {/* Retry fallback — model substituted after repeated call failures. */}
            <div className="border rounded-md p-3 space-y-3">
                <div className="flex items-baseline justify-between">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Retry Fallback
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                        Backend swaps to this model after the retry budget is exhausted.
                    </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <FormField
                        label="Retry Fallback Model"
                        description="Substitute model when calls keep failing."
                    >
                        <Select
                            value={data.retry_fallback_id || "__none__"}
                            onValueChange={(v) =>
                                onChange({ ...data, retry_fallback_id: v === "__none__" ? "" : v })
                            }
                        >
                            <SelectTrigger className="h-8 text-sm">
                                <SelectValue placeholder="Choose retry fallback…">
                                    {data.retry_fallback_id
                                        ? fallbackTargetLabel(data.retry_fallback_id)
                                        : "— no swap —"}
                                </SelectValue>
                            </SelectTrigger>
                            <SelectContent className="max-h-72">
                                <SelectItem
                                    value="__none__"
                                    className="font-normal italic text-muted-foreground"
                                >
                                    — no swap —
                                </SelectItem>
                                {fallbackGroups.map(([provider, models]) => (
                                    <div key={provider}>
                                        <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground/70 border-t mt-1 first:border-t-0 first:mt-0">
                                            {provider}
                                        </div>
                                        {models.map((m) => (
                                            <SelectItem
                                                key={m.id}
                                                value={m.id}
                                                className="text-xs"
                                            >
                                                {m.common_name || m.name}
                                            </SelectItem>
                                        ))}
                                    </div>
                                ))}
                            </SelectContent>
                        </Select>
                    </FormField>
                    <FormField
                        label="Retry Max Attempts"
                        description="Attempts on this model before swapping (0 = backend default)."
                    >
                        <Input
                            type="number"
                            min={0}
                            value={data.retry_max_attempts}
                            onChange={set('retry_max_attempts')}
                            placeholder="0"
                            className="h-8 text-sm"
                        />
                    </FormField>
                </div>
            </div>

            {/* Tier fallbacks — quota/guest-tier model substitution.
                When set, the aidream backend substitutes this model when the
                caller is at the matching tier. Leave at "no swap" for entry-
                level / mid-tier models that don't need to step down. */}
            <div className="border rounded-md p-3 space-y-3">
                <div className="flex items-baseline justify-between">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Tier Fallbacks
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                        Backend swaps this model out when the caller is at the matching tier.
                    </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <FormField
                        label="Mid-tier Fallback"
                        description="Used when an authenticated user is past their soft limit (e.g. Opus → Sonnet)."
                    >
                        <Select
                            value={data.mid_fallback_id || "__none__"}
                            onValueChange={(v) =>
                                onChange({ ...data, mid_fallback_id: v === "__none__" ? "" : v })
                            }
                        >
                            <SelectTrigger className="h-8 text-sm">
                                <SelectValue placeholder="Choose mid-tier fallback…">
                                    {data.mid_fallback_id
                                        ? fallbackTargetLabel(data.mid_fallback_id)
                                        : "— no swap —"}
                                </SelectValue>
                            </SelectTrigger>
                            <SelectContent className="max-h-72">
                                <SelectItem
                                    value="__none__"
                                    className="font-normal italic text-muted-foreground"
                                >
                                    — no swap —
                                </SelectItem>
                                {fallbackGroups.map(([provider, models]) => (
                                    <div key={provider}>
                                        <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground/70 border-t mt-1 first:border-t-0 first:mt-0">
                                            {provider}
                                        </div>
                                        {models.map((m) => (
                                            <SelectItem
                                                key={m.id}
                                                value={m.id}
                                                className="text-xs"
                                            >
                                                {m.common_name || m.name}
                                            </SelectItem>
                                        ))}
                                    </div>
                                ))}
                            </SelectContent>
                        </Select>
                    </FormField>
                    <FormField
                        label="Guest Fallback"
                        description="Used when the caller is an anonymous guest (X-Fingerprint-ID, no Bearer)."
                    >
                        <Select
                            value={data.guest_fallback_id || "__none__"}
                            onValueChange={(v) =>
                                onChange({ ...data, guest_fallback_id: v === "__none__" ? "" : v })
                            }
                        >
                            <SelectTrigger className="h-8 text-sm">
                                <SelectValue placeholder="Choose guest fallback…">
                                    {data.guest_fallback_id
                                        ? fallbackTargetLabel(data.guest_fallback_id)
                                        : "— no swap —"}
                                </SelectValue>
                            </SelectTrigger>
                            <SelectContent className="max-h-72">
                                <SelectItem
                                    value="__none__"
                                    className="font-normal italic text-muted-foreground"
                                >
                                    — no swap —
                                </SelectItem>
                                {fallbackGroups.map(([provider, models]) => (
                                    <div key={provider}>
                                        <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground/70 border-t mt-1 first:border-t-0 first:mt-0">
                                            {provider}
                                        </div>
                                        {models.map((m) => (
                                            <SelectItem
                                                key={m.id}
                                                value={m.id}
                                                className="text-xs"
                                            >
                                                {m.common_name || m.name}
                                            </SelectItem>
                                        ))}
                                    </div>
                                ))}
                            </SelectContent>
                        </Select>
                    </FormField>
                </div>
            </div>

            {/* Delete — only in edit mode */}
            {!isNew && onDelete && (
                <div className="pt-1">
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 gap-1"
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                                Delete Model
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Delete AI Model?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    This will permanently delete <strong>{data.common_name || data.name}</strong>.
                                    Any prompts or builtins using this model will lose their model reference.
                                    This action cannot be undone.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                    onClick={onDelete}
                                    className="bg-destructive hover:bg-destructive/90"
                                >
                                    Delete Model
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            )}
        </div>
    );
}
