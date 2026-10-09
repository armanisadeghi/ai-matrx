'use client';

import React from 'react';
import { Input } from "@ai-matrx/design-system/controls";
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@ai-matrx/design-system';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Trash2 } from 'lucide-react';
import { MODEL_DESCRIPTION_MAX_CHARS } from '../model-metadata';
import { ModelListDropdown } from '@ai-matrx/agents/models/react';
import type { AiModelFormData, AiProvider, AiModel } from '../types';
import { ProTextarea } from "@/components/official/ProTextarea";
import { hasCompatibleDecisionInteraction } from "@ai-matrx/agents/models";

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
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => onChange({ ...data, [key]: e.target.value });

    const toggle = (key: keyof AiModelFormData) => (checked: boolean) =>
        onChange({ ...data, [key]: checked });

    const currentModel = allModels.find((model) => model.name === data.name);
    const fallbackModelIds = allModels
        .filter((model) => model.name !== data.name && !model.is_deprecated && (!currentModel || hasCompatibleDecisionInteraction(currentModel.capabilities, model.capabilities)))
        .map((model) => model.id);

    return (
        <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
                <FormField label="Name" required>
                    <Input mono
                        value={data.name}
                        onChange={set('name')}
                        placeholder="e.g. claude-sonnet-4-6"
                    />
                </FormField>
                <FormField label="Common Name">
                    <Input
                        value={data.common_name}
                        onChange={set('common_name')}
                        placeholder="e.g. Claude Sonnet 4.6"
                    />
                </FormField>
            </div>

            {/* Registry description. Users read this under the model's name in
                every model picker, so it is the one field on this form that is
                pure copy. It is also the human correction path for the
                `model_description` surface write target — an agent may write
                this column, and an admin has to be able to fix what it wrote. */}
            <FormField
                label="Description"
                description={`Shown to users under the model name in pickers. Say what it is good at and when to pick something else — not the numbers already displayed. Max ${MODEL_DESCRIPTION_MAX_CHARS} characters; blank clears it.`}
            >
                <ProTextarea
                    value={data.description}
                    onChange={set('description')}
                    maxLength={MODEL_DESCRIPTION_MAX_CHARS}
                    rows={3}
                    placeholder="e.g. Balanced everyday model — fast enough for chat, strong at code and long documents."
                    className="text-sm min-h-[68px] resize-y"
                />
            </FormField>

            <FormField label="Provider" description="The model's maker">
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
                    />
                </FormField>
                <FormField label="Max Tokens" description="Maximum output tokens">
                    <Input
                        type="number"
                        value={data.max_tokens}
                        onChange={set('max_tokens')}
                        placeholder="e.g. 64000"
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
                        <ModelListDropdown
                            modelOnly
                            value={data.retry_fallback_id}
                            onValueChange={(modelId) =>
                                onChange({ ...data, retry_fallback_id: modelId })
                            }
                            inputModalities={[]}
                            allowedModelIds={fallbackModelIds}
                            catalogVariant="admin"
                            selectionPurpose="admin"
                            emptyOptionLabel="No swap"
                            onClear={() => onChange({ ...data, retry_fallback_id: "" })}
                            placeholder="Choose retry fallback…"
                            className="h-8 w-full justify-between text-sm"
                        />
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
                        />
                    </FormField>
                </div>
            </div>

            {/* Successor — the model that replaces this one when it is retired.
                Pins on this model advance to it through the mandate impact door. */}
            <div className="border rounded-md p-3 space-y-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Successor
                </p>
                <div className="grid grid-cols-2 gap-3">
                    <FormField label="Successor Model">
                        <ModelListDropdown
                            modelOnly
                            value={data.successor_id}
                            onValueChange={(modelId) =>
                                onChange({ ...data, successor_id: modelId })
                            }
                            inputModalities={[]}
                            allowedModelIds={fallbackModelIds}
                            catalogVariant="admin"
                            selectionPurpose="admin"
                            emptyOptionLabel="No successor"
                            onClear={() => onChange({ ...data, successor_id: "" })}
                            placeholder="Choose successor…"
                            className="h-8 w-full justify-between text-sm"
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
                        <ModelListDropdown
                            modelOnly
                            value={data.mid_fallback_id}
                            onValueChange={(modelId) =>
                                onChange({ ...data, mid_fallback_id: modelId })
                            }
                            inputModalities={[]}
                            allowedModelIds={fallbackModelIds}
                            catalogVariant="admin"
                            selectionPurpose="admin"
                            emptyOptionLabel="No swap"
                            onClear={() => onChange({ ...data, mid_fallback_id: "" })}
                            placeholder="Choose mid-tier fallback…"
                            className="h-8 w-full justify-between text-sm"
                        />
                    </FormField>
                    <FormField
                        label="Guest Fallback"
                        description="Used when the caller is an anonymous guest (X-Fingerprint-ID, no Bearer)."
                    >
                        <ModelListDropdown
                            modelOnly
                            value={data.guest_fallback_id}
                            onValueChange={(modelId) =>
                                onChange({ ...data, guest_fallback_id: modelId })
                            }
                            inputModalities={[]}
                            allowedModelIds={fallbackModelIds}
                            catalogVariant="admin"
                            selectionPurpose="admin"
                            emptyOptionLabel="No swap"
                            onClear={() => onChange({ ...data, guest_fallback_id: "" })}
                            placeholder="Choose guest fallback…"
                            className="h-8 w-full justify-between text-sm"
                        />
                    </FormField>
                </div>
            </div>

            {/* Delete — only in edit mode */}
            {!isNew && onDelete && (
                <div className="pt-1">
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button
                                icon={<Trash2 />}
                                variant="quiet"
                            >
                                Move to Trash
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Move AI Model to Trash?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    <strong>{data.common_name || data.name}</strong> leaves the model list, and agents
                                    set to it cannot run on it while it is in Trash. Restore it from Trash to
                                    bring it back.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                    onClick={onDelete}
                                    className="bg-destructive hover:bg-destructive/90"
                                >
                                    Move to Trash
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            )}
        </div>
    );
}
