"use client";

import React, { useState, useMemo } from "react";
import {
    List,
    CheckSquare,
    Lock,
    Globe,
    Users,
    Search,
    SortAsc,
    SortDesc,
    Calendar,
    Hash,
    Copy,
    Check,
    Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ToolRendererProps } from "../../types";
import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";
import { useOpenPicklistManagerV2Window } from "@/features/overlays/openers/picklistManagerV2Window";
import { EntityOpenActions } from "../_shared-entity/EntityOpenActions";
import { getArg, resultAsObject } from "../_shared";
import { filterAndSortBySearch } from "@/utils/search-scoring";

interface UserList {
    id: string;
    list_name: string;
    description: string | null;
    user_id: string;
    is_public: boolean | null;
    public_read: boolean;
    created_at: string;
    updated_at: string;
    item_count: number;
}

interface ParsedListsData {
    lists: UserList[];
    page: number;
    page_size: number;
    count: number;
    search_term?: string;
    isError: boolean;
}

function parseListsData(entry: ToolLifecycleEntry): ParsedListsData {
    const search_term = getArg<string>(entry, "search_term");

    if (entry.status === "error") {
        return { lists: [], page: 1, page_size: 10, count: 0, search_term, isError: true };
    }

    const result = resultAsObject(entry) as
        | { lists?: UserList[]; page?: number; page_size?: number; count?: number }
        | null;

    if (result?.lists) {
        return {
            lists: result.lists,
            page: result.page ?? 1,
            page_size: result.page_size ?? 10,
            count: result.count ?? result.lists.length,
            search_term,
            isError: false,
        };
    }

    return { lists: [], page: 1, page_size: 10, count: 0, search_term, isError: false };
}

function formatDate(iso: string, includeTime = false): string {
    try {
        return new Date(iso).toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
            ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
        });
    } catch {
        return iso;
    }
}

function getVisibility(list: UserList): { label: string; icon: React.ReactNode; variant: "default" | "secondary" | "outline" } {
    if (list.is_public || list.public_read) {
        return { label: "Public", icon: <Globe className="w-3 h-3" />, variant: "default" };
    }
    if (!list.is_public && !list.public_read) {
        return { label: "Users Only", icon: <Users className="w-3 h-3" />, variant: "secondary" };
    }
    return { label: "Private", icon: <Lock className="w-3 h-3" />, variant: "outline" };
}

type SortKey = "name" | "created" | "updated" | "items";
type SortDir = "asc" | "desc";

export const UserListsOverlay: React.FC<ToolRendererProps> = ({ entry }) => {
    const [search, setSearch] = useState("");
    const [sortKey, setSortKey] = useState<SortKey>("created");
    const [sortDir, setSortDir] = useState<SortDir>("desc");
    const [visFilter, setVisFilter] = useState<"all" | "public" | "private" | "users">("all");
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const data = useMemo(() => parseListsData(entry), [entry]);
    const openWindow = useOpenPicklistManagerV2Window();

    const filteredAndSorted = useMemo(() => {
        let items = [...data.lists];

        // Search filter
        if (search.trim()) {
            items = filterAndSortBySearch(items, search, [
                { get: (l) => l.list_name, weight: "title" },
                { get: (l) => l.description, weight: "body" },
            ]);
        }

        // Visibility filter
        if (visFilter !== "all") {
            items = items.filter((l) => {
                if (visFilter === "public") return l.is_public || l.public_read;
                if (visFilter === "users") return !l.is_public && !l.public_read;
                if (visFilter === "private") return false;
                return true;
            });
        }

        // Sort
        items.sort((a, b) => {
            let cmp = 0;
            if (sortKey === "name") cmp = a.list_name.localeCompare(b.list_name);
            else if (sortKey === "created") cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
            else if (sortKey === "updated") cmp = new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
            else if (sortKey === "items") cmp = a.item_count - b.item_count;
            return sortDir === "asc" ? cmp : -cmp;
        });

        return items;
    }, [data.lists, search, sortKey, sortDir, visFilter]);

    const copyId = (id: string) => {
        navigator.clipboard.writeText(id).catch(() => {});
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 1500);
    };

    const toggleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        } else {
            setSortKey(key);
            setSortDir("desc");
        }
    };

    const SortIcon = sortDir === "asc" ? SortAsc : SortDesc;

    if (data.isError) {
        return (
            <div className="p-8 text-center">
                <List className="w-12 h-12 mx-auto text-destructive mb-3" />
                <p className="text-destructive font-medium">Failed to retrieve lists</p>
            </div>
        );
    }

    if (data.lists.length === 0) {
        return (
            <div className="p-8 text-center">
                <List className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No lists found</p>
                {data.search_term && (
                    <p className="text-sm text-muted-foreground mt-1">
                        Search: &ldquo;{data.search_term}&rdquo;
                    </p>
                )}
            </div>
        );
    }

    // Compute stat counts
    const publicCount = data.lists.filter((l) => l.is_public || l.public_read).length;
    const usersCount = data.lists.filter((l) => !l.is_public && !l.public_read).length;
    const privateCount = 0;
    const totalItems = data.lists.reduce((sum, l) => sum + l.item_count, 0);

    return (
        <div className="w-full h-full overflow-y-auto bg-background p-6 space-y-5">
            {/* Summary stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                    { label: "Total Lists", value: data.count, icon: <List className="w-4 h-4 text-primary" /> },
                    { label: "Total Items", value: totalItems, icon: <CheckSquare className="w-4 h-4 text-primary" /> },
                    { label: "Page", value: `${data.page} of ${Math.ceil(data.count / data.page_size)}`, icon: <Hash className="w-4 h-4 text-muted-foreground" /> },
                    { label: "Page Size", value: data.page_size, icon: <Hash className="w-4 h-4 text-muted-foreground" /> },
                ].map(({ label, value, icon }) => (
                    <div key={label} className="bg-card rounded-lg border border-border p-3 flex items-center gap-3">
                        {icon}
                        <div>
                            <p className="text-xs text-muted-foreground">{label}</p>
                            <p className="text-sm font-semibold text-foreground">{value}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Search term display */}
            {data.search_term && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/20">
                    <Search className="w-4 h-4 text-primary" />
                    <span className="text-sm text-foreground">
                        Filtered by: <span className="font-medium italic">&ldquo;{data.search_term}&rdquo;</span>
                    </span>
                </div>
            )}

            {/* Controls */}
            <div className="bg-card rounded-lg border border-border p-4 space-y-3">
                {/* Search */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Filter lists by name or description..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                </div>

                {/* Visibility filter + Sort controls */}
                <div className="flex flex-wrap items-center gap-2">
                    {/* Visibility filters */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                        {[
                            { key: "all" as const, label: `All (${data.lists.length})`, icon: <List className="w-3 h-3" /> },
                            { key: "public" as const, label: `Public (${publicCount})`, icon: <Globe className="w-3 h-3" /> },
                            { key: "users" as const, label: `Users (${usersCount})`, icon: <Users className="w-3 h-3" /> },
                            { key: "private" as const, label: `Private (${privateCount})`, icon: <Lock className="w-3 h-3" /> },
                        ].map(({ key, label, icon }) => (
                            <Button
                                key={key}
                                variant={visFilter === key ? "default" : "outline"}
                                size="sm"
                                onClick={() => setVisFilter(key)}
                                className="gap-1.5 text-xs h-7"
                            >
                                {icon}
                                {label}
                            </Button>
                        ))}
                    </div>

                    {/* Sort controls */}
                    <div className="flex items-center gap-1.5 ml-auto">
                        <span className="text-xs text-muted-foreground mr-1">Sort:</span>
                        {[
                            { key: "created" as const, label: "Date" },
                            { key: "name" as const, label: "Name" },
                            { key: "items" as const, label: "Items" },
                            { key: "updated" as const, label: "Updated" },
                        ].map(({ key, label }) => (
                            <Button
                                key={key}
                                variant={sortKey === key ? "default" : "outline"}
                                size="sm"
                                onClick={() => toggleSort(key)}
                                className="gap-1 text-xs h-7"
                            >
                                {label}
                                {sortKey === key && <SortIcon className="w-3 h-3" />}
                            </Button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Results count */}
            <p className="text-xs text-muted-foreground">
                Showing {filteredAndSorted.length} of {data.lists.length} lists
            </p>

            {/* List cards */}
            <div className="space-y-3">
                {filteredAndSorted.map((list) => {
                    const vis = getVisibility(list);
                    const isCopied = copiedId === list.id;

                    return (
                        <div
                            key={list.id}
                            className="bg-card rounded-lg border border-border p-4 hover:border-primary/30 transition-colors"
                        >
                            <div className="flex items-start justify-between gap-3">
                                {/* Left: icon + name */}
                                <div className="flex items-start gap-3 min-w-0">
                                    <div className="flex-shrink-0 w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center mt-0.5">
                                        <CheckSquare className="w-5 h-5 text-primary" />
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="text-sm font-semibold text-foreground leading-snug">
                                            {list.list_name}
                                        </h3>
                                        {list.description && (
                                            <p className="text-sm text-muted-foreground mt-0.5">{list.description}</p>
                                        )}
                                    </div>
                                </div>

                                {/* Right: visibility badge */}
                                <Badge variant={vis.variant} className="flex-shrink-0 flex items-center gap-1 text-xs">
                                    {vis.icon}
                                    {vis.label}
                                </Badge>
                            </div>

                            {/* Metadata row */}
                            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                    <CheckSquare className="w-3 h-3" />
                                    <span className="font-medium text-foreground">{list.item_count}</span>
                                    {list.item_count === 1 ? " item" : " items"}
                                </span>
                                <span className="flex items-center gap-1">
                                    <Calendar className="w-3 h-3" />
                                    Created {formatDate(list.created_at)}
                                </span>
                                {list.updated_at !== list.created_at && (
                                    <span className="flex items-center gap-1">
                                        <Calendar className="w-3 h-3" />
                                        Updated {formatDate(list.updated_at)}
                                    </span>
                                )}
                            </div>

                            {/* Access permissions row */}
                            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                    <Shield className="w-3 h-3" />
                                    <span>
                                        {list.is_public != null ? (list.is_public ? "Public" : "Not public") : "Visibility unset"}
                                    </span>
                                </span>
                                <span className="flex items-center gap-1">
                                    {list.public_read ? (
                                        <Globe className="w-3 h-3 text-success" />
                                    ) : (
                                        <Lock className="w-3 h-3" />
                                    )}
                                    <span>{list.public_read ? "Public read enabled" : "Public read disabled"}</span>
                                </span>
                            </div>

                            {/* ID row + open actions */}
                            <div className="mt-2 flex items-center gap-2">
                                <span className="text-xs font-mono text-muted-foreground truncate">{list.id}</span>
                                <button
                                    onClick={() => copyId(list.id)}
                                    className="flex-shrink-0 p-1 rounded hover:bg-muted transition-colors"
                                    title="Copy list ID"
                                >
                                    {isCopied ? (
                                        <Check className="w-3 h-3 text-success" />
                                    ) : (
                                        <Copy className="w-3 h-3 text-muted-foreground" />
                                    )}
                                </button>
                                <EntityOpenActions
                                    className="ml-auto"
                                    onOpenWindow={() =>
                                        openWindow({ forcedListId: list.id, title: list.list_name })
                                    }
                                    href={`/lists/${list.id}`}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* No results after filter */}
            {filteredAndSorted.length === 0 && (
                <div className="py-10 text-center">
                    <Search className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                    <p className="text-muted-foreground text-sm">No lists match your filters</p>
                </div>
            )}
        </div>
    );
};
