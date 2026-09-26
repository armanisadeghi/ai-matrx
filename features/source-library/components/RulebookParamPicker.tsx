"use client";

/**
 * Pick a Rulebook, or make one, without leaving the confirm.
 *
 * "Send to a Masterwork Rulebook" declares `rulebook_id` in its params schema
 * (§8), and a uuid is not something a person has. THE DOOR LAW cuts both ways:
 * a control that names a record must reach it, and a control that needs a
 * record the person has not made yet must be able to make it. So this is a real
 * picker over the Rulebooks they can already see, plus one line that creates a
 * draft — the same `createDraftRulebook` the Masterwork feature itself uses, so
 * there is no second way to create one.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, CircleAlert, Loader2, Plus } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { Button } from "@/components/ui/button";
import { Input, Skeleton } from "@ai-matrx/design-system";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { DEFAULT_ENTITY_LIST_QUERY } from "@/lib/entity-list/types";
import { fetchRulebookPage } from "@/features/masterwork/browse/service";
import { createDraftRulebook } from "@/features/masterwork/service";
import type { RulebookListRow } from "@/features/masterwork/types";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

export function RulebookParamPicker({
    label,
    value,
    onChange,
}: {
    label: string;
    value: string | null;
    onChange: (next: string | null) => void;
}) {
    const organizationId = useAppSelector(selectOrganizationId);
    const [rulebooks, setRulebooks] = useState<RulebookListRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState("");
    const [showCreate, setShowCreate] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const page = await fetchRulebookPage(
                { ...DEFAULT_ENTITY_LIST_QUERY, scope: { kind: "mine" } },
                { sort: "updated_at", direction: "desc", favoritesFirst: false, pageSize: 50 },
            );
            setRulebooks(page.rows);
            if (page.rows.length === 0) setShowCreate(true);
        } catch (caught) {
            setError(
                caught instanceof Error
                    ? `Your Rulebooks could not be read: ${caught.message}`
                    : "Your Rulebooks could not be read.",
            );
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    /** The id of the intent the open create box represents; see `create`. */
    const createToken = useRef<string | null>(null);

    const create = useCallback(async () => {
        const name = newName.trim();
        if (!name || !organizationId) return;
        setCreating(true);
        setError(null);
        try {
            // ONE INTENT, ONE RULEBOOK (cold walk 20, defect C). The open create
            // box is the intent: pressing Create twice in it lands on one
            // Rulebook, and the token is retired when the box closes.
            if (!createToken.current) createToken.current = crypto.randomUUID();
            const rulebook = await createDraftRulebook({
                name,
                description: "",
                source: {},
                organizationId,
                clientToken: createToken.current,
            });
            createToken.current = null;
            setRulebooks((current) => [
                { ...(rulebook as unknown as RulebookListRow) },
                ...current,
            ]);
            onChange(rulebook.id);
            setShowCreate(false);
            setNewName("");
        } catch (caught) {
            setError(
                caught instanceof Error
                    ? `That Rulebook could not be created: ${caught.message}`
                    : "That Rulebook could not be created.",
            );
        } finally {
            setCreating(false);
        }
    }, [newName, onChange, organizationId]);

    return (
        <div className="space-y-1.5">
            <Label htmlFor="param-rulebook_id">{label}</Label>

            {loading ? (
                <Skeleton className="h-11 w-full" />
            ) : (
                <>
                    {rulebooks.length > 0 && (
                        <Select
                            value={value ?? ""}
                            onValueChange={(next) => onChange(next || null)}
                        >
                            <SelectTrigger id="param-rulebook_id" className="h-11">
                                <SelectValue placeholder="Choose a Rulebook" />
                            </SelectTrigger>
                            <SelectContent>
                                {rulebooks.map((rulebook) => (
                                    <SelectItem key={rulebook.id} value={rulebook.id}>
                                        <span className="flex items-center gap-2">
                                            <BookOpen className="size-3.5" aria-hidden />
                                            {rulebook.name}
                                            <span className="text-xs text-muted-foreground">
                                                {rulebook.rule_count} rules
                                            </span>
                                        </span>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}

                    {showCreate ? (
                        <div className="flex items-center gap-2">
                            <Input
                                className="h-11"
                                value={newName}
                                placeholder="Name the new Rulebook"
                                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                                    setNewName(event.target.value)
                                }
                            />
                            <Button
                                type="button"
                                className="h-11 shrink-0 gap-2"
                                disabled={!newName.trim() || creating || !organizationId}
                                onClick={() => void create()}
                            >
                                {creating ? (
                                    <Loader2 className="size-4 animate-spin" aria-hidden />
                                ) : (
                                    <Plus className="size-4" aria-hidden />
                                )}
                                Create
                            </Button>
                        </div>
                    ) : (
                        <Button
                            type="button"
                            variant="ghost"
                            className="h-11 gap-2 px-2 text-sm"
                            onClick={() => setShowCreate(true)}
                        >
                            <Plus className="size-4" aria-hidden />
                            Or make a new Rulebook
                        </Button>
                    )}

                    {rulebooks.length === 0 && !error && (
                        <p className="text-xs text-muted-foreground">
                            You have no Rulebooks yet. Name one and it is created as a
                            draft, ready for these videos.
                        </p>
                    )}

                    {!organizationId && (
                        <p className="text-xs text-muted-foreground">
                            A Rulebook is created inside an organization, and none is
                            active right now — pick one from the organization switcher
                            first.
                        </p>
                    )}
                </>
            )}

            {error && (
                <p className="flex items-start gap-2 text-xs text-destructive">
                    <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    {error}
                  <ErrorAlchemyMenu error={error} />
                </p>
            )}
        </div>
    );
}
