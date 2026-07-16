"use client";

/**
 * SkillInline — the clean renderer for the `skill` tool (and the legacy
 * `skill_search` / `skill_list` names). Skill lookups are "known pretty data":
 * a search returns hints (label · description · type), a get returns one skill
 * definition — so they get the official card grammar, never the key/value dump
 * that printed UUIDs, `SklSkillType.REFERENCE` reprs, and "No result returned"
 * rows into the chat (owner-flagged 2026-07-15).
 *
 * What we show and what we DON'T:
 *   • NO ids — meaningless in chat; they live in the Tool Admin / Raw tabs.
 *   • Enum reprs humanized ("SklSkillType.RENDER_BLOCK" → "Render block").
 *   • Empty fields (category: null, allowed_tools: []) simply don't render.
 *   • Search → one card: header "Found N skills · <query>", one row per hint
 *     (label + humanized type, description clamped beneath).
 *   • Get → one card: header (label · type · vN), the description clamped
 *     with Show more, quiet category chips. The skill BODY (often a whole
 *     markdown document the agent read) stays in the Tool Admin tabs.
 *
 * Shapes read defensively; anything unrecognized falls to <GenericRenderer>.
 */

import React from "react";
import { LibraryBig } from "lucide-react";

import { cn } from "@/lib/utils";

import type { ToolRendererProps } from "../../types";
import { isTerminal, resultAsObject } from "../_shared";
import { GenericRenderer } from "../../registry/GenericRenderer";
import { ToolErrorCard } from "../../result-fields/ToolErrorCard";
import { humanizeEnumValue } from "../../result-fields/shape";

// ─── payload shapes ──────────────────────────────────────────────────────────

interface SkillHint {
    label: string;
    description: string;
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
    return {
        label,
        description: typeof o.description === "string" ? o.description.trim() : "",
        type: humanType(o.skill_type),
    };
}

// ─── card pieces (official grammar) ──────────────────────────────────────────

const Card: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="w-full overflow-hidden rounded-xl border border-border/50 bg-card">
        {children}
    </div>
);

const CardHeader: React.FC<{ title: string; sub: string | null }> = ({ title, sub }) => (
    <div className="flex items-center gap-3 px-4 py-2.5">
        <LibraryBig
            className="size-[18px] shrink-0 text-violet-600 dark:text-violet-400"
            strokeWidth={2.25}
        />
        <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-foreground">{title}</span>
            {sub && <span className="block truncate text-xs text-muted-foreground">{sub}</span>}
        </span>
    </div>
);

/** Clamped description with in-place Show more. */
const ClampedText: React.FC<{ text: string; lines?: 2 | 3 }> = ({ text, lines = 2 }) => {
    const [open, setOpen] = React.useState(false);
    const long = text.length > 220;
    return (
        <div>
            <p
                className={cn(
                    "whitespace-pre-line text-xs leading-relaxed text-muted-foreground",
                    !open && (lines === 2 ? "line-clamp-2" : "line-clamp-3"),
                )}
            >
                {text}
            </p>
            {long && (
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        setOpen((v) => !v);
                    }}
                    className="mt-0.5 text-xs font-medium text-primary hover:underline"
                >
                    {open ? "Show less" : "Show more"}
                </button>
            )}
        </div>
    );
};

// ─── search card ─────────────────────────────────────────────────────────────

const SkillSearchCard: React.FC<{ query: string | null; hints: SkillHint[] }> = ({
    query,
    hints,
}) => (
    <Card>
        <CardHeader
            title={`Found ${hints.length} ${hints.length === 1 ? "skill" : "skills"}`}
            sub={query ? `“${query}”` : null}
        />
        {hints.length > 0 && (
            <div className="border-t border-border/50">
                {hints.map((h, i) => (
                    <div
                        key={`${h.label}-${i}`}
                        className={cn("px-4 py-2", i > 0 && "border-t border-border/30")}
                    >
                        <div className="flex items-baseline gap-2">
                            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
                                {h.label}
                            </span>
                            {h.type && (
                                <span className="shrink-0 text-xs text-muted-foreground">{h.type}</span>
                            )}
                        </div>
                        {h.description && (
                            <div className="mt-0.5">
                                <ClampedText text={h.description} />
                            </div>
                        )}
                    </div>
                ))}
            </div>
        )}
    </Card>
);

// ─── get card ────────────────────────────────────────────────────────────────

const SkillGetCard: React.FC<{ skill: Record<string, unknown> }> = ({ skill }) => {
    const label =
        (typeof skill.label === "string" && skill.label) ||
        (typeof skill.skill_id === "string" && skill.skill_id) ||
        "Skill";
    const type = humanType(skill.skill_type);
    const version = typeof skill.version === "number" ? `v${skill.version}` : null;
    const sub = ["Skill", type, version].filter(Boolean).join(" · ");
    const description = typeof skill.description === "string" ? skill.description.trim() : "";
    const categories = Array.isArray(skill.category_path)
        ? (skill.category_path as unknown[]).filter((c): c is string => typeof c === "string")
        : [];

    return (
        <Card>
            <CardHeader title={label} sub={sub} />
            {(description || categories.length > 0) && (
                <div className="space-y-2 border-t border-border/50 px-4 py-2.5">
                    {description && <ClampedText text={description} lines={3} />}
                    {categories.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5">
                            {categories.map((c) => (
                                <span
                                    key={c}
                                    className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
                                >
                                    {c}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </Card>
    );
};

// ─── dispatcher ──────────────────────────────────────────────────────────────

export const SkillInline: React.FC<ToolRendererProps> = (props) => {
    const { entry, onOpenOverlay, toolGroupId } = props;

    if (entry.status === "error") {
        return <ToolErrorCard entry={entry} onOpenOverlay={onOpenOverlay} toolGroupId={toolGroupId} />;
    }
    if (!isTerminal(entry)) return null;

    const result = resultAsObject(entry);

    // Search / list shape: { query?, count?, hints: [...] } (or `skills`).
    const hintArray = result && (Array.isArray(result.hints) ? result.hints : Array.isArray(result.skills) ? result.skills : null);
    if (hintArray) {
        const hints = hintArray.map(asHint).filter((h): h is SkillHint => h !== null);
        if (hints.length > 0 || hintArray.length === 0) {
            const query = typeof result?.query === "string" && result.query ? result.query : null;
            return <SkillSearchCard query={query} hints={hints} />;
        }
    }

    // Get shape: one skill definition object.
    if (result && (typeof result.skill_id === "string" || typeof result.label === "string")) {
        return <SkillGetCard skill={result} />;
    }

    return <GenericRenderer {...props} />;
};

export default SkillInline;
