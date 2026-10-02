"use client";

/**
 * SkillInline — the renderer for the `skill` tool (and legacy `skill_search` /
 * `skill_list`). Registered with `chrome: "card"`, so the shell renders THIS
 * card directly — no folded glyph line above it, no duplicate icon/label.
 *
 * Built ON the canonical `ToolResultCard` (owner rule: one template, never
 * reinvented): full-width header (icon · title · sub), click-anywhere toggle,
 * bordered "Open" dropdown with the canonical Window Panel · Tool Admin pair.
 *
 * Density follows intent (owner-specified, 2026-07-15):
 *   • SEARCH is a keyword lookup — show WHAT WAS FOUND, nice and small: one
 *     line per hit (label · humanized type). No descriptions, no ids.
 *   • GET is the agent adopting a skill — now the detail matters: full
 *     description, category chips, trigger patterns. The huge markdown `body`
 *     stays in Tool Admin / Raw.
 *
 * Shapes read defensively; anything unrecognized falls to <GenericRenderer>.
 */

import React from "react";
import { LibraryBig } from "lucide-react";

import { cn } from "@/lib/utils";

import type { ToolRendererProps } from "../../types";
import { getArg, isTerminal, resultAsObject } from "../_shared";
import { GenericRenderer } from "../../registry/GenericRenderer";
import { ToolErrorCard } from "../../result-fields/ToolErrorCard";
import { humanizeEnumValue } from "../../result-fields/shape";
import { ToolResultCard } from "../_shared-entity/ToolResultCard";

const SKILL_ICON_TINT = "text-violet-600 dark:text-violet-400";

// ─── payload shapes ──────────────────────────────────────────────────────────

interface SkillHint {
    label: string;
    type: string | null;
}

function humanType(raw: unknown): string | null {
    if (typeof raw !== "string" || !raw) return null;
    return humanizeEnumValue(raw) ?? raw;
}

function asHint(raw: unknown): SkillHint | null {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
    const o = raw as Record<string, unknown>;
    const label =
        (typeof o.label === "string" && o.label) ||
        (typeof o.skill_id === "string" && o.skill_id) ||
        null;
    if (!label) return null;
    return { label, type: humanType(o.skill_type) };
}

function stringArray(raw: unknown): string[] {
    return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : [];
}

// ─── component ───────────────────────────────────────────────────────────────

export const SkillInline: React.FC<ToolRendererProps> = (props) => {
    const { entry, onOpenOverlay, onOpenWindowPanel, toolGroupId, expanded, onToggleExpanded } =
        props;

    if (entry.status === "error") {
        return <ToolErrorCard entry={entry} onOpenOverlay={onOpenOverlay} toolGroupId={toolGroupId} />;
    }
    if (!isTerminal(entry)) return null;

    const result = resultAsObject(entry);
    const cardShellProps = {
        icon: LibraryBig,
        iconClassName: SKILL_ICON_TINT,
        expanded,
        onToggleExpanded,
        onOpenWindowPanel: onOpenWindowPanel ? () => onOpenWindowPanel() : undefined,
        onOpenOverlay: onOpenOverlay ? () => onOpenOverlay() : undefined,
    } as const;

    // ── Search / list: WHAT WAS FOUND, one line per hit ──────────────────────
    const hintArray =
        result &&
        (Array.isArray(result.hints) ? result.hints : Array.isArray(result.skills) ? result.skills : null);
    if (hintArray) {
        const hints = hintArray.map(asHint).filter((h): h is SkillHint => h !== null);
        if (hints.length > 0 || hintArray.length === 0) {
            const query =
                (typeof result?.query === "string" && result.query) ||
                getArg<string>(entry, "query") ||
                null;
            return (
                <ToolResultCard
                    {...cardShellProps}
                    title={`Found ${hints.length} ${hints.length === 1 ? "skill" : "skills"}`}
                    sub={query ? `“${query}”` : null}
                >
                    {hints.length > 0 ? (
                        <div>
                            {hints.map((h, i) => (
                                <div
                                    key={`${h.label}-${i}`}
                                    className={cn(
                                        "flex items-baseline gap-2 px-4 py-1.5",
                                        i > 0 && "border-t border-border/30",
                                    )}
                                >
                                    <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
                                        {h.label}
                                    </span>
                                    {h.type && (
                                        <span className="shrink-0 text-xs text-muted-foreground">{h.type}</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : undefined}
                </ToolResultCard>
            );
        }
    }

    // ── Get: the agent adopted this skill — show the detail ──────────────────
    if (result && (typeof result.skill_id === "string" || typeof result.label === "string")) {
        const label =
            (typeof result.label === "string" && result.label) ||
            (result.skill_id as string) ||
            "Skill";
        const type = humanType(result.skill_type);
        const version = typeof result.version === "number" ? `v${result.version}` : null;
        const description =
            typeof result.description === "string" ? result.description.trim() : "";
        const categories = stringArray(result.category_path);
        const triggers = stringArray(result.trigger_patterns);

        return (
            <ToolResultCard
                {...cardShellProps}
                title={label}
                sub={["Skill", type, version].filter(Boolean).join(" · ")}
            >
                {(description || categories.length > 0 || triggers.length > 0) && (
                    <div className="space-y-2.5 px-4 py-3">
                        {description && (
                            <p className="whitespace-pre-line text-[13px] leading-relaxed text-foreground">
                                {description}
                            </p>
                        )}
                        {(categories.length > 0 || triggers.length > 0) && (
                            <div className="flex flex-wrap items-center gap-1.5">
                                {categories.map((c) => (
                                    <span
                                        key={`c-${c}`}
                                        className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground"
                                    >
                                        {c}
                                    </span>
                                ))}
                                {triggers.map((t) => (
                                    <span
                                        key={`t-${t}`}
                                        className="rounded-md border border-border/50 px-1.5 py-0.5 text-xs text-muted-foreground"
                                    >
                                        {t}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </ToolResultCard>
        );
    }

    return <GenericRenderer {...props} />;
};

export default SkillInline;
