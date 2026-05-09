"use client";

import { useState, useEffect, useCallback, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Search, SlidersHorizontal, Plus, X, FileText, Loader2, Check, ChevronRight, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { BottomSheet, BottomSheetHeader, BottomSheetBody } from "@/components/official/bottom-sheet/BottomSheet";
import { cn } from "@/lib/utils";
import { ContentTemplateDB, MessageRole } from "@/features/content-templates/types/content-templates-db";
import {
    fetchContentTemplates,
    deleteTemplate,
    clearTemplateCache,
} from "@/features/content-templates/services/content-templates-service";
import { ContentTemplatesPageHeader } from "./ContentTemplatesPageHeader";
import { TemplateCard } from "./TemplateCard";
import { TemplateActionDrawer } from "./TemplateActionDrawer";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUser } from "@/lib/redux/slices/userSlice";

type ActiveTab = "my" | "public";
type SortOption = "updated-desc" | "updated-asc" | "created-desc" | "label-asc" | "label-desc";
type VisibilityFilter = "all" | "public" | "private";

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
    { value: "updated-desc", label: "Recently Updated" },
    { value: "updated-asc", label: "Oldest Updated" },
    { value: "created-desc", label: "Newest Created" },
    { value: "label-asc", label: "Name (A–Z)" },
    { value: "label-desc", label: "Name (Z–A)" },
];

const ROLE_OPTIONS: { value: MessageRole | "all"; label: string }[] = [
    { value: "all", label: "All Types" },
    { value: "system", label: "System" },
    { value: "user", label: "User" },
    { value: "assistant", label: "Assistant" },
    { value: "tool", label: "Tool" },
];

const VISIBILITY_OPTIONS: { value: VisibilityFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "public", label: "Public" },
    { value: "private", label: "Private" },
];

interface TopBarProps {
    activeTab: ActiveTab;
    onTabChange: (tab: ActiveTab) => void;
    myCount: number;
    publicCount: number;
    searchValue: string;
    onSearchChange: (v: string) => void;
    onFilterClick: () => void;
    onNewClick: () => void;
    activeFilterCount: number;
}

function TopBar({
    activeTab, onTabChange, myCount, publicCount,
    searchValue, onSearchChange, onFilterClick, onNewClick, activeFilterCount,
}: TopBarProps) {
    const [local, setLocal] = useState(searchValue);
    useEffect(() => { setLocal(searchValue); }, [searchValue]);
    const handleChange = (v: string) => { setLocal(v); onSearchChange(v); };

    return (
        <div className="flex-shrink-0 px-3 pt-3 pb-2  border-b border-border/40">
            <div className="flex items-center gap-2 p-1.5 rounded-full ">
                {/* Tab pills — nano glass for active, transparent for inactive */}
                <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                        onClick={() => onTabChange("my")}
                        className={cn(
                            "flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
                            activeTab === "my"
                                ? "bg-primary text-primary-foreground"
                                : "text-muted-foreground hover:matrx-glass-thin-border"
                        )}
                    >
                        Mine
                        <span className={cn(
                            "text-[10px] px-1 rounded-full",
                            activeTab === "my" ? "bg-primary-foreground/20 text-primary-foreground" : "text-muted-foreground"
                        )}>
                            {myCount}
                        </span>
                    </button>
                    <button
                        onClick={() => onTabChange("public")}
                        className={cn(
                            "flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
                            activeTab === "public"
                                ? "bg-primary text-primary-foreground"
                                : "text-muted-foreground hover:matrx-glass-thin-border"
                        )}
                    >
                        Public
                        <span className={cn(
                            "text-[10px] px-1 rounded-full",
                            activeTab === "public" ? "bg-primary-foreground/20 text-primary-foreground" : "text-muted-foreground"
                        )}>
                            {publicCount}
                        </span>
                    </button>
                </div>

                {/* Search — matrx-glass-thin-border per spec */}
                <div className="flex-1 flex items-center gap-1.5 h-8 px-2.5 rounded-full matrx-glass-thin-border min-w-0">
                    <Search className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <input
                        type="text"
                        value={local}
                        onChange={(e) => handleChange(e.target.value)}
                        placeholder="Search..."
                        style={{ fontSize: "16px" }}
                        className="flex-1 bg-transparent border-0 outline-none text-xs text-foreground placeholder:text-muted-foreground min-w-0"
                    />
                    {local && (
                        <button onClick={() => handleChange("")} className="flex-shrink-0 text-muted-foreground active:opacity-70">
                            <X className="h-3 w-3" />
                        </button>
                    )}
                </div>

                {/* Filter — matrx-glass-thin-border per spec */}
                <button
                    onClick={onFilterClick}
                    className="flex-shrink-0 relative h-8 w-8 flex items-center justify-center rounded-full matrx-glass-thin-border text-muted-foreground active:opacity-70 transition-opacity"
                >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    {activeFilterCount > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 h-4 w-4 flex items-center justify-center bg-primary text-primary-foreground rounded-full text-[9px] font-bold">
                            {activeFilterCount}
                        </span>
                    )}
                </button>

                {/* New — primary solid sits naturally on vibrancy */}
                <button
                    onClick={onNewClick}
                    className="flex-shrink-0 h-8 w-8 flex items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95 transition-all"
                >
                    <Plus className="h-4 w-4" />
                </button>
            </div>
        </div>
    );
}

export function UserContentTemplateManager() {
    const router = useRouter();
    const { toast } = useToast();
    const [isPending, startTransition] = useTransition();

    const [templates, setTemplates] = useState<ContentTemplateDB[]>([]);
    const [loading, setLoading] = useState(true);
    const { id: currentUserId } = useAppSelector(selectUser);

    // Filter & sort state
    const [searchTerm, setSearchTerm] = useState("");
    const [activeTab, setActiveTab] = useState<ActiveTab>("my");
    const [sortBy, setSortBy] = useState<SortOption>("updated-desc");
    const [selectedRole, setSelectedRole] = useState<MessageRole | "all">("all");
    const [selectedVisibility, setSelectedVisibility] = useState<VisibilityFilter>("all");
    const [selectedTags, setSelectedTags] = useState<string[]>([]);

    // Bottom sheet drill-down state
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [filterDetailKey, setFilterDetailKey] = useState<"sort" | "role" | "visibility" | "tags" | null>(null);

    // Action state
    const [actionTarget, setActionTarget] = useState<ContentTemplateDB | null>(null);
    const [isActionOpen, setIsActionOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<ContentTemplateDB | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            const data = await fetchContentTemplates();
            setTemplates(data);
        } catch (err) {
            console.error("Error loading templates:", err);
            toast({ title: "Failed to load templates", variant: "destructive" });
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        if (currentUserId) loadData();
    }, [loadData, currentUserId]);

    // Derive all unique tags from all templates
    const allTags = useMemo(() => {
        const tagSet = new Set<string>();
        templates.forEach((t) => t.tags?.forEach((tag) => tagSet.add(tag)));
        return Array.from(tagSet).sort();
    }, [templates]);

    const myTemplates = useMemo(() => templates.filter((t) => t.user_id === currentUserId), [templates, currentUserId]);
    const publicTemplates = useMemo(() => templates.filter((t) => t.is_public && t.user_id !== currentUserId), [templates, currentUserId]);
    const baseList = activeTab === "my" ? myTemplates : publicTemplates;

    const filteredTemplates = useMemo(() => {
        let list = baseList.filter((t) => {
            if (selectedRole !== "all" && t.role !== selectedRole) return false;
            if (selectedVisibility === "public" && !t.is_public) return false;
            if (selectedVisibility === "private" && t.is_public) return false;
            if (selectedTags.length > 0 && !selectedTags.every((tag) => t.tags?.includes(tag))) return false;
            if (searchTerm) {
                const q = searchTerm.toLowerCase();
                if (
                    !t.label?.toLowerCase().includes(q) &&
                    !t.content?.toLowerCase().includes(q) &&
                    !t.tags?.some((tag) => tag.toLowerCase().includes(q))
                ) return false;
            }
            return true;
        });

        list.sort((a, b) => {
            switch (sortBy) {
                case "label-asc": return (a.label ?? "").localeCompare(b.label ?? "");
                case "label-desc": return (b.label ?? "").localeCompare(a.label ?? "");
                case "created-desc": return (b.created_at ?? "").localeCompare(a.created_at ?? "");
                case "updated-asc": return (a.updated_at ?? a.created_at ?? "").localeCompare(b.updated_at ?? b.created_at ?? "");
                case "updated-desc":
                default: return (b.updated_at ?? b.created_at ?? "").localeCompare(a.updated_at ?? a.created_at ?? "");
            }
        });
        return list;
    }, [baseList, selectedRole, selectedVisibility, selectedTags, searchTerm, sortBy]);

    // Active filter count (excludes tab — that's primary nav)
    const activeFilterCount = useMemo(() => (
        (sortBy !== "updated-desc" ? 1 : 0) +
        (selectedRole !== "all" ? 1 : 0) +
        (selectedVisibility !== "all" ? 1 : 0) +
        selectedTags.length
    ), [sortBy, selectedRole, selectedVisibility, selectedTags]);

    const resetFilters = () => {
        setSortBy("updated-desc");
        setSelectedRole("all");
        setSelectedVisibility("all");
        setSelectedTags([]);
    };

    const canEdit = (t: ContentTemplateDB) => t.user_id === currentUserId;

    const handleNewTemplate = () => startTransition(() => router.push("/settings/content-templates/new"));
    const handleView = (t: ContentTemplateDB) => startTransition(() => router.push(`/settings/content-templates/${t.id}`));
    const handleEdit = (t: ContentTemplateDB) => startTransition(() => router.push(`/settings/content-templates/${t.id}?mode=edit`));
    const handleDuplicate = (t: ContentTemplateDB) => startTransition(() => router.push(`/settings/content-templates/new?from=${t.id}`));
    const handleCardClick = (t: ContentTemplateDB) => { setActionTarget(t); setIsActionOpen(true); };
    const handleDeleteRequest = (t: ContentTemplateDB) => setDeleteTarget(t);

    const handleDeleteConfirm = async () => {
        if (!deleteTarget) return;
        setIsDeleting(true);
        try {
            await deleteTemplate(deleteTarget.id);
            clearTemplateCache();
            await loadData();
            toast({ title: "Template deleted" });
        } catch (err) {
            console.error("Error deleting template:", err);
            toast({ title: "Failed to delete template", variant: "destructive" });
        } finally {
            setIsDeleting(false);
            setDeleteTarget(null);
        }
    };

    const handleFilterSheetChange = (open: boolean) => {
        setIsFilterOpen(open);
        if (!open) setFilterDetailKey(null);
    };

    const toggleTag = (tag: string) => {
        setSelectedTags((prev) =>
            prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
        );
    };

    if (loading) {
        return (
            <div className="h-[calc(100dvh-var(--header-height))] flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    // ── Filter sheet title ──────────────────────────────────────────────────────
    const sheetTitle =
        filterDetailKey === "sort" ? "Sort By" :
        filterDetailKey === "role" ? "Type" :
        filterDetailKey === "visibility" ? "Visibility" :
        filterDetailKey === "tags" ? "Tags" :
        "Filters & Sort";

    return (
        <>
            <ContentTemplatesPageHeader />

            <div className="h-[calc(100dvh-var(--header-height))] flex flex-col bg-transparent">
                <TopBar
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                    myCount={myTemplates.length}
                    publicCount={publicTemplates.length}
                    searchValue={searchTerm}
                    onSearchChange={setSearchTerm}
                    onFilterClick={() => setIsFilterOpen(true)}
                    onNewClick={handleNewTemplate}
                    activeFilterCount={activeFilterCount}
                />

                <div className="flex-1 overflow-y-auto px-3 pb-24 md:pb-6">
                    {filteredTemplates.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                            <FileText className="w-10 h-10 text-muted-foreground/40 mb-3" />
                            <p className="text-sm font-medium text-muted-foreground">
                                {searchTerm || activeFilterCount > 0
                                    ? "No matching templates"
                                    : activeTab === "my" ? "No templates yet" : "No public templates"}
                            </p>
                            {!searchTerm && activeFilterCount === 0 && activeTab === "my" && (
                                <Button size="sm" className="mt-4" onClick={handleNewTemplate}>
                                    <Plus className="w-4 h-4 mr-1" />
                                    New Template
                                </Button>
                            )}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                            {filteredTemplates.map((t) => (
                                <TemplateCard
                                    key={t.id}
                                    template={t}
                                    onClick={handleCardClick}
                                    isDisabled={isPending}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Action drawer */}
            <TemplateActionDrawer
                template={actionTarget}
                isOpen={isActionOpen}
                onClose={() => setIsActionOpen(false)}
                canEdit={actionTarget ? canEdit(actionTarget) : false}
                onView={handleView}
                onEdit={handleEdit}
                onDuplicate={handleDuplicate}
                onDelete={handleDeleteRequest}
            />

            {/* Filter bottom sheet */}
            <BottomSheet open={isFilterOpen} onOpenChange={handleFilterSheetChange} title="Filters & Sort">
                <BottomSheetHeader
                    title={sheetTitle}
                    showBack={filterDetailKey !== null}
                    onBack={() => setFilterDetailKey(null)}
                    trailing={
                        filterDetailKey === null ? (
                            activeFilterCount > 0 ? (
                                <button
                                    onClick={resetFilters}
                                    className="flex items-center gap-1 text-primary active:opacity-70 min-h-[44px] px-1"
                                >
                                    <RotateCcw className="h-3.5 w-3.5" />
                                    <span className="text-[15px]">Reset</span>
                                </button>
                            ) : (
                                <button
                                    onClick={() => handleFilterSheetChange(false)}
                                    className="text-primary active:opacity-70 min-h-[44px] px-1 text-[15px]"
                                >
                                    Done
                                </button>
                            )
                        ) : null
                    }
                />
                <BottomSheetBody>
                    {filterDetailKey === "sort" ? (
                        /* ── Sort detail ── */
                        <>
                            {SORT_OPTIONS.map((opt, idx) => (
                                <button
                                    key={opt.value}
                                    onClick={() => { setSortBy(opt.value); setFilterDetailKey(null); }}
                                    className={cn(
                                        "flex items-center w-full px-5 min-h-[44px] active:bg-white/5 transition-colors",
                                        idx < SORT_OPTIONS.length - 1 && "border-b border-white/[0.06]"
                                    )}
                                >
                                    <span className={cn("text-[15px] flex-1 text-left", sortBy === opt.value && "font-medium")}>
                                        {opt.label}
                                    </span>
                                    {sortBy === opt.value && <Check className="h-5 w-5 text-primary shrink-0" />}
                                </button>
                            ))}
                        </>
                    ) : filterDetailKey === "role" ? (
                        /* ── Role detail ── */
                        <>
                            {ROLE_OPTIONS.map((opt, idx) => (
                                <button
                                    key={opt.value}
                                    onClick={() => { setSelectedRole(opt.value); setFilterDetailKey(null); }}
                                    className={cn(
                                        "flex items-center w-full px-5 min-h-[44px] active:bg-white/5 transition-colors",
                                        idx < ROLE_OPTIONS.length - 1 && "border-b border-white/[0.06]"
                                    )}
                                >
                                    <span className={cn("text-[15px] flex-1 text-left", selectedRole === opt.value && "font-medium")}>
                                        {opt.label}
                                    </span>
                                    {selectedRole === opt.value && <Check className="h-5 w-5 text-primary shrink-0" />}
                                </button>
                            ))}
                        </>
                    ) : filterDetailKey === "visibility" ? (
                        /* ── Visibility detail ── */
                        <>
                            {VISIBILITY_OPTIONS.map((opt, idx) => (
                                <button
                                    key={opt.value}
                                    onClick={() => { setSelectedVisibility(opt.value); setFilterDetailKey(null); }}
                                    className={cn(
                                        "flex items-center w-full px-5 min-h-[44px] active:bg-white/5 transition-colors",
                                        idx < VISIBILITY_OPTIONS.length - 1 && "border-b border-white/[0.06]"
                                    )}
                                >
                                    <span className={cn("text-[15px] flex-1 text-left", selectedVisibility === opt.value && "font-medium")}>
                                        {opt.label}
                                    </span>
                                    {selectedVisibility === opt.value && <Check className="h-5 w-5 text-primary shrink-0" />}
                                </button>
                            ))}
                        </>
                    ) : filterDetailKey === "tags" ? (
                        /* ── Tags detail — multi-select ── */
                        <>
                            {allTags.length === 0 ? (
                                <div className="flex items-center justify-center py-8">
                                    <p className="text-[15px] text-muted-foreground">No tags available</p>
                                </div>
                            ) : (
                                allTags.map((tag, idx) => (
                                    <button
                                        key={tag}
                                        onClick={() => toggleTag(tag)}
                                        className={cn(
                                            "flex items-center w-full px-5 min-h-[44px] active:bg-white/5 transition-colors",
                                            idx < allTags.length - 1 && "border-b border-white/[0.06]"
                                        )}
                                    >
                                        <span className={cn("text-[15px] flex-1 text-left", selectedTags.includes(tag) && "font-medium")}>
                                            {tag}
                                        </span>
                                        {selectedTags.includes(tag) && <Check className="h-5 w-5 text-primary shrink-0" />}
                                    </button>
                                ))
                            )}
                        </>
                    ) : (
                        /* ── Main filter menu ── */
                        <>
                            {/* Sort By */}
                            <button
                                onClick={() => setFilterDetailKey("sort")}
                                className="flex items-center w-full px-5 min-h-[52px] active:bg-white/5 transition-colors border-b border-white/[0.06]"
                            >
                                <span className="text-[15px] font-medium flex-1 text-left">Sort By</span>
                                <span className={cn("text-[15px] mr-1.5 truncate max-w-[180px]", sortBy !== "updated-desc" ? "text-foreground" : "text-muted-foreground")}>
                                    {SORT_OPTIONS.find((o) => o.value === sortBy)?.label}
                                </span>
                                <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                            </button>

                            {/* Type / Role */}
                            <button
                                onClick={() => setFilterDetailKey("role")}
                                className="flex items-center w-full px-5 min-h-[52px] active:bg-white/5 transition-colors border-b border-white/[0.06]"
                            >
                                <span className="text-[15px] font-medium flex-1 text-left">Type</span>
                                <span className={cn("text-[15px] mr-1.5 truncate max-w-[180px]", selectedRole !== "all" ? "text-foreground" : "text-muted-foreground")}>
                                    {ROLE_OPTIONS.find((o) => o.value === selectedRole)?.label}
                                </span>
                                <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                            </button>

                            {/* Visibility */}
                            <button
                                onClick={() => setFilterDetailKey("visibility")}
                                className="flex items-center w-full px-5 min-h-[52px] active:bg-white/5 transition-colors border-b border-white/[0.06]"
                            >
                                <span className="text-[15px] font-medium flex-1 text-left">Visibility</span>
                                <span className={cn("text-[15px] mr-1.5 truncate max-w-[180px]", selectedVisibility !== "all" ? "text-foreground" : "text-muted-foreground")}>
                                    {VISIBILITY_OPTIONS.find((o) => o.value === selectedVisibility)?.label}
                                </span>
                                <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                            </button>

                            {/* Tags */}
                            <button
                                onClick={() => setFilterDetailKey("tags")}
                                className="flex items-center w-full px-5 min-h-[52px] active:bg-white/5 transition-colors border-b border-white/[0.06]"
                            >
                                <span className="text-[15px] font-medium flex-1 text-left">Tags</span>
                                <span className={cn("text-[15px] mr-1.5 truncate max-w-[180px]", selectedTags.length > 0 ? "text-foreground" : "text-muted-foreground")}>
                                    {selectedTags.length > 0 ? selectedTags.slice(0, 2).join(", ") + (selectedTags.length > 2 ? ` +${selectedTags.length - 2}` : "") : "Any"}
                                </span>
                                <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                            </button>

                            {activeFilterCount > 0 && (
                                <div className="pt-4 pb-2">
                                    <p className="text-[13px] text-muted-foreground text-center">
                                        {activeFilterCount} active {activeFilterCount === 1 ? "filter" : "filters"}
                                    </p>
                                </div>
                            )}
                        </>
                    )}
                </BottomSheetBody>
            </BottomSheet>

            {/* Delete confirmation */}
            <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Template</AlertDialogTitle>
                        <AlertDialogDescription>
                            Delete &ldquo;{deleteTarget?.label}&rdquo;? This cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDeleteConfirm}
                            disabled={isDeleting}
                            className="bg-destructive hover:bg-destructive/90"
                        >
                            {isDeleting ? "Deleting..." : "Delete"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
