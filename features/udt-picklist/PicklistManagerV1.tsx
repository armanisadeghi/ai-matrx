"use client";

/**
 * PicklistManager
 *
 * Spreadsheet-style editor for udt_picklists / udt_picklist_items.
 *
 * Schema notes:
 * - udt_picklists: id, list_name, description, user_id, is_public, public_read, created_at, updated_at
 * - udt_picklist_items: id, list_id (FK -> udt_picklists.id, ON DELETE CASCADE),
 *     label, description, help_text, group_name, icon_name, user_id, is_public, public_read, created_at, updated_at
 * - There is NO sort_order column on items. Items are sorted alphabetically within group_name,
 *   with ungrouped items pushed to the bottom.
 *
 * Behavior:
 * - Sidebar lists all picklists for the current user.
 * - Main pane shows the active list as a spreadsheet:
 *     [#] [icon] [label] [description] [help_text] [group] [delete]
 * - Autosave with debounce (500ms) on text fields; immediate writes on discrete actions.
 * - Optimistic UI; rollback on error.
 * - Delete (row or list) is undoable for 5 seconds via toast.
 *
 * Drop into Matrx Admin and wire `getSupabaseClient` / `currentUserId` to your existing helpers.
 */

import * as React from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { toast } from "sonner";
import {
    Check,
    Globe,
    Loader2,
    Lock,
    Plus,
    Search,
    SquarePlus,
    Trash2,
    X,
    // Tabler icons aren't a 1:1 lucide map; for the picker we render lucide names instead of Tabler.
    // The picker stores `icon_name` as the lucide string so the UI can render it directly.
    User,
    Users,
    Settings,
    Heart,
    Star,
    Bell,
    Mail,
    Eye,
    Calendar,
    Clock,
    File,
    Folder,
    Briefcase,
    Book,
    Bookmark,
    Flag,
    Tag,
    Tags,
    Target,
    Trophy,
    Gift,
    Rocket,
    Lightbulb,
    Zap,
    Flame,
    Sparkles,
    Leaf,
    TreePine,
    Sun,
    Moon,
    Cloud,
    MapPin,
    Plane,
    Car,
    Building,
    GraduationCap,
    Code,
    Terminal,
    Database,
    Server,
    Cpu,
    Laptop,
    Smartphone,
    Camera,
    Music,
    Headphones,
    Video,
    Mic,
    MessageSquare,
    Phone,
    Send,
    Wallet,
    CreditCard,
    DollarSign,
    ShoppingCart,
    BarChart3,
    LineChart,
    Presentation,
    Clipboard,
    Notebook,
    Pencil,
    Brush,
    Palette,
    Wrench,
    Hammer,
    Key,
    Shield,
    Home,
    ArrowRight,
    type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { idMatchesQuery } from "@/utils/search-scoring";

// ---------- Types ----------

type Picklist = {
    id: string;
    list_name: string | null;
    description: string | null;
    is_public: boolean | null;
    public_read: boolean | null;
    user_id: string | null;
    created_at: string;
    updated_at: string | null;
};

type PicklistItem = {
    id: string;
    list_id: string | null;
    label: string | null;
    description: string | null;
    help_text: string | null;
    group_name: string | null;
    icon_name: string | null;
    is_public: boolean | null;
    public_read: boolean | null;
    user_id: string | null;
    created_at: string;
    updated_at: string | null;
};

type SaveStatus = "idle" | "saving" | "saved" | "error";

// ---------- Icon registry ----------
// Keyed by the string stored in udt_picklist_items.icon_name so we can render whatever is in the DB.

const ICONS: Record<string, LucideIcon> = {
    home: Home,
    user: User,
    users: Users,
    settings: Settings,
    heart: Heart,
    star: Star,
    bell: Bell,
    mail: Mail,
    eye: Eye,
    calendar: Calendar,
    clock: Clock,
    file: File,
    folder: Folder,
    briefcase: Briefcase,
    book: Book,
    bookmark: Bookmark,
    flag: Flag,
    tag: Tag,
    tags: Tags,
    target: Target,
    trophy: Trophy,
    gift: Gift,
    rocket: Rocket,
    lightbulb: Lightbulb,
    zap: Zap,
    flame: Flame,
    sparkles: Sparkles,
    leaf: Leaf,
    tree: TreePine,
    sun: Sun,
    moon: Moon,
    cloud: Cloud,
    "map-pin": MapPin,
    plane: Plane,
    car: Car,
    building: Building,
    school: GraduationCap,
    code: Code,
    terminal: Terminal,
    database: Database,
    server: Server,
    cpu: Cpu,
    laptop: Laptop,
    smartphone: Smartphone,
    camera: Camera,
    music: Music,
    headphones: Headphones,
    video: Video,
    mic: Mic,
    message: MessageSquare,
    phone: Phone,
    send: Send,
    wallet: Wallet,
    "credit-card": CreditCard,
    dollar: DollarSign,
    cart: ShoppingCart,
    "chart-bar": BarChart3,
    "chart-line": LineChart,
    presentation: Presentation,
    clipboard: Clipboard,
    notebook: Notebook,
    pencil: Pencil,
    brush: Brush,
    palette: Palette,
    wrench: Wrench,
    hammer: Hammer,
    key: Key,
    shield: Shield,
    check: Check,
    arrow: ArrowRight,
};

const ICON_NAMES = Object.keys(ICONS);

function IconByName({ name, className }: { name: string | null; className?: string }) {
    if (!name) return null;
    const Cmp = ICONS[name];
    if (!Cmp) return null;
    return <Cmp className={className} />;
}

// ---------- Debounce hook ----------

function useDebouncedCallback<T extends (...args: any[]) => void>(fn: T, delay: number) {
    const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const fnRef = React.useRef(fn);
    fnRef.current = fn;

    const debounced = React.useCallback(
        (...args: Parameters<T>) => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            timeoutRef.current = setTimeout(() => fnRef.current(...args), delay);
        },
        [delay]
    );

    const flush = React.useCallback(() => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
    }, []);

    React.useEffect(() => () => flush(), [flush]);

    return [debounced, flush] as const;
}

// ---------- Sorting ----------

function sortItems(items: PicklistItem[]): PicklistItem[] {
    // Stable group order: groups alphabetically first, then ungrouped at the bottom.
    return [...items].sort((a, b) => {
        const ga = a.group_name || "";
        const gb = b.group_name || "";
        if (ga === "" && gb !== "") return 1;
        if (gb === "" && ga !== "") return -1;
        if (ga !== gb) return ga.localeCompare(gb);
        return (a.label || "").localeCompare(b.label || "");
    });
}

function uniqueGroups(items: PicklistItem[]): string[] {
    const s = new Set<string>();
    items.forEach((i) => {
        if (i.group_name) s.add(i.group_name);
    });
    return Array.from(s).sort((a, b) => a.localeCompare(b));
}

// ---------- Main component ----------

export type PicklistManagerV1Props = {
    supabase: SupabaseClient;
    userId: string;
    /**
     * When provided, pin to a single list and hide the sidebar. Used by the
     * single-list window-panel mode and from any modal/drawer that wants to
     * scope the editor to one picklist.
     */
    forcedListId?: string | null;
};

export function PicklistManagerV1({ supabase, userId, forcedListId }: PicklistManagerV1Props) {
    const [lists, setLists] = React.useState<Picklist[]>([]);
    const [items, setItems] = React.useState<PicklistItem[]>([]);
    const [activeId, setActiveId] = React.useState<string | null>(forcedListId ?? null);
    const [search, setSearch] = React.useState("");
    const [loading, setLoading] = React.useState(true);
    const [saveStatus, setSaveStatus] = React.useState<SaveStatus>("idle");
    const [deleteListOpen, setDeleteListOpen] = React.useState(false);

    // ------- Initial load -------

    React.useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);

            // Single-list mode: skip the catalog query and just load the one
            // list (+ its items). RLS still applies — if the caller passes a
            // list_id the current user can't read, we drop back to an empty
            // state instead of crashing.
            if (forcedListId) {
                const [listRes, itemsRes] = await Promise.all([
                    supabase.from("udt_picklists").select("*").eq("id", forcedListId).maybeSingle(),
                    supabase.from("udt_picklist_items").select("*").eq("list_id", forcedListId),
                ]);
                if (cancelled) return;
                if (listRes.error || !listRes.data) {
                    toast.error("Couldn't load this picklist");
                    setLists([]);
                    setItems([]);
                    setActiveId(null);
                    setLoading(false);
                    return;
                }
                setLists([listRes.data as Picklist]);
                setActiveId(listRes.data.id);
                if (!itemsRes.error) setItems((itemsRes.data ?? []) as PicklistItem[]);
                setLoading(false);
                return;
            }

            const { data: listsData, error: listsErr } = await supabase
                .from("udt_picklists")
                .select("*")
                .eq("user_id", userId)
                .order("updated_at", { ascending: false });

            if (listsErr) {
                toast.error("Failed to load picklists");
                setLoading(false);
                return;
            }
            if (cancelled) return;

            const fetched = listsData ?? [];
            setLists(fetched);
            const first = fetched[0]?.id ?? null;
            setActiveId(first);

            if (first) {
                const { data: itemsData, error: itemsErr } = await supabase
                    .from("udt_picklist_items")
                    .select("*")
                    .eq("list_id", first);
                if (!cancelled && !itemsErr) setItems(itemsData ?? []);
            }
            setLoading(false);
        })();
        return () => {
            cancelled = true;
        };
    }, [supabase, userId, forcedListId]);

    // ------- Load items when active list changes -------

    React.useEffect(() => {
        if (!activeId) {
            setItems([]);
            return;
        }
        let cancelled = false;
        (async () => {
            const { data, error } = await supabase
                .from("udt_picklist_items")
                .select("*")
                .eq("list_id", activeId);
            if (!cancelled && !error) setItems(data ?? []);
        })();
        return () => {
            cancelled = true;
        };
    }, [activeId, supabase]);

    // ------- Save status helpers -------

    const flashSaved = React.useCallback(() => {
        setSaveStatus("saved");
        const t = setTimeout(() => setSaveStatus("idle"), 1200);
        return () => clearTimeout(t);
    }, []);

    // ------- Picklist mutations -------

    const createList = async () => {
        const optimistic: Picklist = {
            id: crypto.randomUUID(),
            list_name: "",
            description: "",
            is_public: false,
            public_read: true,
            user_id: userId,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
        setLists((prev) => [optimistic, ...prev]);
        setActiveId(optimistic.id);
        setItems([]);
        setSaveStatus("saving");

        const { error } = await supabase.from("udt_picklists").insert({
            id: optimistic.id,
            list_name: "",
            description: "",
            is_public: false,
            user_id: userId,
        });
        if (error) {
            setLists((prev) => prev.filter((l) => l.id !== optimistic.id));
            setSaveStatus("error");
            toast.error("Couldn't create picklist");
            return;
        }
        flashSaved();
    };

    const updateListField = async <K extends keyof Picklist>(id: string, field: K, value: Picklist[K]) => {
        setLists((prev) => prev.map((l) => (l.id === id ? { ...l, [field]: value } : l)));
        setSaveStatus("saving");
        const { error } = await supabase
            .from("udt_picklists")
            .update({ [field]: value })
            .eq("id", id);
        if (error) {
            setSaveStatus("error");
            toast.error("Save failed");
            return;
        }
        flashSaved();
    };

    // Debounced text-field updates for the list header
    const [debouncedUpdateList] = useDebouncedCallback(updateListField, 500);

    const deleteList = async (id: string) => {
        const snapshotList = lists.find((l) => l.id === id);
        if (!snapshotList) return;
        // Items will cascade-delete in the DB; no need to back them up.

        // Optimistic remove
        setLists((prev) => prev.filter((l) => l.id !== id));
        if (activeId === id) {
            const remaining = lists.filter((l) => l.id !== id);
            setActiveId(remaining[0]?.id ?? null);
        }

        let undone = false;
        const timer = setTimeout(async () => {
            if (undone) return;
            const { error } = await supabase.from("udt_picklists").delete().eq("id", id);
            if (error) {
                setLists((prev) => [snapshotList, ...prev]);
                toast.error("Delete failed");
            }
        }, 5000);

        toast(`Deleted "${snapshotList.list_name || "Untitled list"}"`, {
            action: {
                label: "Undo",
                onClick: () => {
                    undone = true;
                    clearTimeout(timer);
                    setLists((prev) => [snapshotList, ...prev]);
                    setActiveId(id);
                },
            },
            duration: 5000,
        });
    };

    // ------- Item mutations -------

    const createItem = async (groupName: string | null, focusFieldRef?: React.MutableRefObject<string | null>): Promise<PicklistItem | null> => {
        if (!activeId) return null;
        const optimistic: PicklistItem = {
            id: crypto.randomUUID(),
            list_id: activeId,
            label: "",
            description: "",
            help_text: "",
            group_name: groupName,
            icon_name: null,
            is_public: false,
            public_read: true,
            user_id: userId,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
        setItems((prev) => [...prev, optimistic]);
        setSaveStatus("saving");

        const { error } = await supabase.from("udt_picklist_items").insert({
            id: optimistic.id,
            list_id: activeId,
            label: "",
            description: "",
            help_text: "",
            group_name: groupName,
            user_id: userId,
        });
        if (error) {
            setItems((prev) => prev.filter((i) => i.id !== optimistic.id));
            setSaveStatus("error");
            toast.error("Couldn't add item");
            return null;
        }
        flashSaved();
        if (focusFieldRef) focusFieldRef.current = optimistic.id;
        return optimistic;
    };

    const updateItemField = async <K extends keyof PicklistItem>(id: string, field: K, value: PicklistItem[K]) => {
        let snapshot: PicklistItem | undefined;
        setItems((prev) =>
            prev.map((i) => {
                if (i.id === id) {
                    snapshot = i;
                    return { ...i, [field]: value };
                }
                return i;
            })
        );
        setSaveStatus("saving");
        const { error } = await supabase
            .from("udt_picklist_items")
            .update({ [field]: value })
            .eq("id", id);
        if (error && snapshot) {
            setItems((prev) => prev.map((i) => (i.id === id ? snapshot! : i)));
            setSaveStatus("error");
            toast.error("Save failed");
            return;
        }
        flashSaved();
    };

    const [debouncedUpdateItem] = useDebouncedCallback(updateItemField, 500);

    const deleteItem = (id: string) => {
        const snapshot = items.find((i) => i.id === id);
        if (!snapshot) return;
        setItems((prev) => prev.filter((i) => i.id !== id));

        let undone = false;
        const timer = setTimeout(async () => {
            if (undone) return;
            const { error } = await supabase.from("udt_picklist_items").delete().eq("id", id);
            if (error) {
                setItems((prev) => [...prev, snapshot]);
                toast.error("Delete failed");
            }
        }, 5000);

        toast(`Deleted "${snapshot.label || "item"}"`, {
            action: {
                label: "Undo",
                onClick: () => {
                    undone = true;
                    clearTimeout(timer);
                    setItems((prev) => [...prev, snapshot]);
                },
            },
            duration: 5000,
        });
    };

    const renameGroup = async (oldName: string, newName: string) => {
        if (oldName === newName || !activeId) return;
        const affected = items.filter((i) => (i.group_name || "") === oldName);
        if (affected.length === 0) return;

        setItems((prev) => prev.map((i) => ((i.group_name || "") === oldName ? { ...i, group_name: newName || null } : i)));
        setSaveStatus("saving");

        const { error } = await supabase
            .from("udt_picklist_items")
            .update({ group_name: newName || null })
            .eq("list_id", activeId)
            .eq("group_name", oldName);
        if (error) {
            // rollback
            setItems((prev) => prev.map((i) => ((i.group_name || "") === newName ? { ...i, group_name: oldName } : i)));
            setSaveStatus("error");
            toast.error("Couldn't rename group");
            return;
        }
        flashSaved();
    };

    // ------- Derived -------

    const filteredLists = React.useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return lists;
        return lists.filter((l) => (l.list_name || "").toLowerCase().includes(q) || idMatchesQuery(l, q));
    }, [lists, search]);

    const activeList = React.useMemo(() => lists.find((l) => l.id === activeId) ?? null, [lists, activeId]);
    const sortedItems = React.useMemo(() => sortItems(items), [items]);
    const groups = React.useMemo(() => uniqueGroups(items), [items]);

    // Group the sorted items into sections
    const sections = React.useMemo(() => {
        const map = new Map<string, PicklistItem[]>();
        sortedItems.forEach((i) => {
            const k = i.group_name || "";
            if (!map.has(k)) map.set(k, []);
            map.get(k)!.push(i);
        });
        return Array.from(map.entries());
    }, [sortedItems]);

    // ------- Keyboard helpers for spreadsheet feel -------

    const itemsRef = React.useRef<HTMLDivElement | null>(null);
    const focusItemField = (itemId: string, field: "label" | "description" | "help_text") => {
        requestAnimationFrame(() => {
            const el = itemsRef.current?.querySelector<HTMLInputElement>(
                `input[data-item-id="${itemId}"][data-field="${field}"]`
            );
            el?.focus();
        });
    };

    const handleAddRow = async (group: string | null, focusField: "label" | "description" | "help_text" = "label") => {
        const created = await createItem(group);
        if (created) focusItemField(created.id, focusField);
    };

    // ------- Render -------

    if (loading) {
        return (
            <div className="flex h-[600px] items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading picklists…
            </div>
        );
    }

    return (
        <div
            className={cn(
                "grid h-[calc(100vh-8rem)] min-h-[560px] overflow-hidden rounded-lg border bg-background",
                forcedListId ? "grid-cols-1" : "grid-cols-[260px_1fr]",
            )}
        >
            {/* Sidebar — hidden in single-list mode */}
            {!forcedListId && (
            <aside className="flex min-h-0 flex-col border-r bg-muted/30">
                <div className="flex items-center justify-between px-3 pb-2 pt-3">
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Picklists
                    </span>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={createList} title="New picklist">
                        <Plus className="h-3.5 w-3.5" />
                    </Button>
                </div>
                <div className="px-2 pb-2">
                    <div className="relative">
                        <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search lists…"
                            className="h-8 pl-7 text-sm"
                        />
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto px-1 pb-2">
                    {filteredLists.length === 0 ? (
                        <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                            {search ? "No matches" : "No picklists yet"}
                        </div>
                    ) : (
                        filteredLists.map((l) => {
                            const isActive = l.id === activeId;
                            const itemCount = activeId === l.id ? items.length : null;
                            return (
                                <button
                                    key={l.id}
                                    onClick={() => setActiveId(l.id)}
                                    className={cn(
                                        "group/list mb-px flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors",
                                        isActive ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
                                    )}
                                >
                                    <span className="line-clamp-1 w-full text-sm leading-tight">
                                        {l.list_name || <span className="text-muted-foreground italic">Untitled list</span>}
                                    </span>
                                    {itemCount !== null && (
                                        <span className="text-[11px] text-muted-foreground">
                                            {itemCount} item{itemCount === 1 ? "" : "s"}
                                        </span>
                                    )}
                                </button>
                            );
                        })
                    )}
                </div>
            </aside>
            )}

            {/* Main */}
            <section className="flex min-h-0 min-w-0 flex-col">
                {!activeList ? (
                    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
                        <p>No picklist selected.</p>
                        <Button variant="outline" size="sm" onClick={createList}>
                            <Plus className="mr-1.5 h-3.5 w-3.5" /> New picklist
                        </Button>
                    </div>
                ) : (
                    <>
                        {/* Header */}
                        <div className="flex flex-col gap-0.5 border-b px-5 py-3">
                            <div className="flex items-center gap-2">
                                <Input
                                    key={activeList.id + "-title"}
                                    defaultValue={activeList.list_name || ""}
                                    placeholder="Untitled list"
                                    onChange={(e) => debouncedUpdateList(activeList.id, "list_name", e.target.value)}
                                    onBlur={(e) => updateListField(activeList.id, "list_name", e.target.value)}
                                    className="h-9 flex-1 border-none bg-transparent px-1 text-lg font-medium shadow-none focus-visible:bg-muted/50 focus-visible:ring-1"
                                />
                                <button
                                    type="button"
                                    onClick={() => updateListField(activeList.id, "is_public", !activeList.is_public)}
                                    className={cn(
                                        "flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors",
                                        activeList.is_public
                                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                                            : "bg-muted text-muted-foreground hover:bg-muted/80"
                                    )}
                                >
                                    {activeList.is_public ? <Globe className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                                    {activeList.is_public ? "Public" : "Private"}
                                </button>
                                {!forcedListId && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                    onClick={() => setDeleteListOpen(true)}
                                    title="Delete picklist"
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                                )}
                            </div>
                            <Input
                                key={activeList.id + "-desc"}
                                defaultValue={activeList.description || ""}
                                placeholder="Add a description…"
                                onChange={(e) => debouncedUpdateList(activeList.id, "description", e.target.value)}
                                onBlur={(e) => updateListField(activeList.id, "description", e.target.value)}
                                className="h-7 border-none bg-transparent px-1 text-sm text-muted-foreground shadow-none focus-visible:bg-muted/50 focus-visible:ring-1"
                            />
                        </div>

                        {/* Table head */}
                        <div className="grid grid-cols-[26px_28px_minmax(0,1.3fr)_minmax(0,1.5fr)_minmax(0,1.1fr)_140px_28px] gap-1.5 border-b bg-muted/30 px-5 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                            <span />
                            <span />
                            <span>Label</span>
                            <span>Description</span>
                            <span>Help text</span>
                            <span>Group</span>
                            <span />
                        </div>

                        {/* Rows */}
                        <div ref={itemsRef} className="flex-1 overflow-y-auto py-1 pb-20">
                            {sections.length === 0 ? (
                                <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                                    <p className="mb-3">No items yet.</p>
                                    <Button variant="outline" size="sm" onClick={() => handleAddRow(null)}>
                                        <Plus className="mr-1.5 h-3.5 w-3.5" /> Add first item
                                    </Button>
                                </div>
                            ) : (
                                sections.map(([groupName, groupItems], sectionIdx) => (
                                    <div key={groupName + "-" + sectionIdx}>
                                        <div className="flex items-center gap-2 px-5 pb-1 pt-3">
                                            {groupName === "" ? (
                                                <span className="text-xs italic text-muted-foreground">No group</span>
                                            ) : (
                                                <GroupNameEditor
                                                    name={groupName}
                                                    onRename={(next) => renameGroup(groupName, next)}
                                                />
                                            )}
                                            <span className="text-[11px] text-muted-foreground">{groupItems.length}</span>
                                        </div>
                                        {groupItems.map((item, rowIdx) => (
                                            <ItemRow
                                                key={item.id}
                                                item={item}
                                                index={getGlobalIndex(sections, sectionIdx, rowIdx)}
                                                groups={groups}
                                                onFieldChange={(field, value) => debouncedUpdateItem(item.id, field, value)}
                                                onFieldBlur={(field, value) => updateItemField(item.id, field, value)}
                                                onIconChange={(icon) => updateItemField(item.id, "icon_name", icon)}
                                                onGroupChange={(g) => updateItemField(item.id, "group_name", g)}
                                                onDelete={() => deleteItem(item.id)}
                                                onEnter={(field) => handleAddRow(item.group_name, field)}
                                                onTabOffLast={(field) => handleAddRow(item.group_name, field)}
                                                onBackspaceEmpty={() => {
                                                    if (!item.label && !item.description && !item.help_text && !item.icon_name) {
                                                        deleteItem(item.id);
                                                    }
                                                }}
                                            />
                                        ))}
                                    </div>
                                ))
                            )}
                            <div className="px-5 pt-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="border-dashed text-muted-foreground"
                                    onClick={() => handleAddRow(null)}
                                >
                                    <Plus className="mr-1.5 h-3.5 w-3.5" /> Add item
                                </Button>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-between border-t bg-muted/30 px-5 py-1.5 text-[11px] text-muted-foreground">
                            <span>
                                <Kbd>Tab</Kbd> next field <Kbd>↵</Kbd> new row <Kbd>⌫</Kbd> delete empty
                            </span>
                            <SaveIndicator status={saveStatus} />
                        </div>
                    </>
                )}
            </section>

            {/* Delete-list confirm dialog */}
            <Dialog open={deleteListOpen} onOpenChange={setDeleteListOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete this picklist?</DialogTitle>
                        <DialogDescription>
                            "{activeList?.list_name || "Untitled list"}" and all {items.length} item
                            {items.length === 1 ? "" : "s"} will be deleted. You'll have a few seconds to undo.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteListOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={() => {
                                if (activeList) deleteList(activeList.id);
                                setDeleteListOpen(false);
                            }}
                        >
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

// ---------- Subcomponents ----------

function getGlobalIndex(sections: [string, PicklistItem[]][], sectionIdx: number, rowIdx: number) {
    let n = 0;
    for (let i = 0; i < sectionIdx; i++) n += sections[i][1].length;
    return n + rowIdx + 1;
}

function GroupNameEditor({ name, onRename }: { name: string; onRename: (next: string) => void }) {
    const [value, setValue] = React.useState(name);
    React.useEffect(() => setValue(name), [name]);
    return (
        <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => onRename(value.trim())}
            onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") {
                    setValue(name);
                    (e.target as HTMLInputElement).blur();
                }
            }}
            className="h-6 w-auto min-w-0 max-w-[260px] border border-border/60 bg-muted/40 px-2 py-0 text-xs font-medium text-muted-foreground shadow-none focus-visible:bg-background focus-visible:ring-1"
            placeholder="Group name"
        />
    );
}

type ItemRowProps = {
    item: PicklistItem;
    index: number;
    groups: string[];
    onFieldChange: (field: "label" | "description" | "help_text", value: string) => void;
    onFieldBlur: (field: "label" | "description" | "help_text", value: string) => void;
    onIconChange: (icon: string | null) => void;
    onGroupChange: (group: string | null) => void;
    onDelete: () => void;
    onEnter: (field: "label" | "description" | "help_text") => void;
    onTabOffLast: (field: "label" | "description" | "help_text") => void;
    onBackspaceEmpty: () => void;
};

function ItemRow({
    item,
    index,
    groups,
    onFieldChange,
    onFieldBlur,
    onIconChange,
    onGroupChange,
    onDelete,
    onEnter,
    onTabOffLast,
    onBackspaceEmpty,
}: ItemRowProps) {
    return (
        <div className="group/row grid grid-cols-[26px_28px_minmax(0,1.3fr)_minmax(0,1.5fr)_minmax(0,1.1fr)_140px_28px] items-center gap-1.5 px-5 py-0.5 hover:bg-muted/40">
            <span className="text-right text-[11px] tabular-nums text-muted-foreground">{index}</span>

            <IconPicker icon={item.icon_name} onChange={onIconChange} />

            <CellInput
                itemId={item.id}
                field="label"
                defaultValue={item.label || ""}
                placeholder="Item label"
                onChange={(v) => onFieldChange("label", v)}
                onBlur={(v) => onFieldBlur("label", v)}
                onEnter={() => onEnter("label")}
                onBackspaceEmpty={onBackspaceEmpty}
            />
            <CellInput
                itemId={item.id}
                field="description"
                defaultValue={item.description || ""}
                placeholder="—"
                muted
                onChange={(v) => onFieldChange("description", v)}
                onBlur={(v) => onFieldBlur("description", v)}
                onEnter={() => onEnter("description")}
            />
            <CellInput
                itemId={item.id}
                field="help_text"
                defaultValue={item.help_text || ""}
                placeholder="—"
                muted
                onChange={(v) => onFieldChange("help_text", v)}
                onBlur={(v) => onFieldBlur("help_text", v)}
                onEnter={() => onEnter("help_text")}
                onTabOffLast={() => onTabOffLast("help_text")}
            />

            <GroupSelect value={item.group_name} groups={groups} onChange={onGroupChange} />

            <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground opacity-0 hover:bg-destructive/10 hover:text-destructive group-hover/row:opacity-100"
                onClick={onDelete}
                title="Delete row"
            >
                <Trash2 className="h-3.5 w-3.5" />
            </Button>
        </div>
    );
}

function CellInput({
    itemId,
    field,
    defaultValue,
    placeholder,
    muted,
    onChange,
    onBlur,
    onEnter,
    onTabOffLast,
    onBackspaceEmpty,
}: {
    itemId: string;
    field: "label" | "description" | "help_text";
    defaultValue: string;
    placeholder?: string;
    muted?: boolean;
    onChange: (v: string) => void;
    onBlur: (v: string) => void;
    onEnter?: () => void;
    onTabOffLast?: () => void;
    onBackspaceEmpty?: () => void;
}) {
    return (
        <Input
            data-item-id={itemId}
            data-field={field}
            defaultValue={defaultValue}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
            onBlur={(e) => onBlur(e.target.value)}
            onKeyDown={(e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    (e.target as HTMLInputElement).blur(); // flush save
                    onEnter?.();
                } else if (e.key === "Backspace" && !(e.target as HTMLInputElement).value && onBackspaceEmpty) {
                    e.preventDefault();
                    onBackspaceEmpty();
                } else if (e.key === "Tab" && !e.shiftKey && onTabOffLast) {
                    e.preventDefault();
                    (e.target as HTMLInputElement).blur();
                    onTabOffLast();
                }
            }}
            className={cn(
                "h-7 border-transparent bg-transparent px-2 text-[13px] shadow-none hover:border-border hover:bg-background focus-visible:bg-background focus-visible:ring-1",
                muted && "text-muted-foreground"
            )}
        />
    );
}

function IconPicker({ icon, onChange }: { icon: string | null; onChange: (next: string | null) => void }) {
    const [open, setOpen] = React.useState(false);
    const [q, setQ] = React.useState("");
    const filtered = React.useMemo(() => {
        const s = q.trim().toLowerCase();
        if (!s) return ICON_NAMES;
        return ICON_NAMES.filter((n) => n.includes(s));
    }, [q]);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                        "h-7 w-7 border border-transparent text-muted-foreground hover:border-border hover:bg-background",
                        icon && "text-foreground"
                    )}
                    title={icon || "Add icon"}
                >
                    {icon ? <IconByName name={icon} className="h-4 w-4" /> : <SquarePlus className="h-3.5 w-3.5 opacity-50" />}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-2" align="start">
                <Input
                    placeholder="Search icons…"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    className="mb-2 h-8 text-sm"
                    autoFocus
                />
                <div className="grid max-h-[200px] grid-cols-8 gap-0.5 overflow-y-auto">
                    {filtered.map((n) => {
                        const Cmp = ICONS[n];
                        const selected = n === icon;
                        return (
                            <button
                                key={n}
                                onClick={() => {
                                    onChange(n);
                                    setOpen(false);
                                }}
                                className={cn(
                                    "flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground",
                                    selected && "bg-accent text-foreground"
                                )}
                                title={n}
                            >
                                <Cmp className="h-4 w-4" />
                            </button>
                        );
                    })}
                </div>
                <div className="mt-2 flex items-center justify-between border-t pt-2 text-[11px] text-muted-foreground">
                    <span>{icon ? `Current: ${icon}` : "No icon set"}</span>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[11px]"
                        onClick={() => {
                            onChange(null);
                            setOpen(false);
                        }}
                    >
                        Clear
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    );
}

const NEW_GROUP_TOKEN = "__new_group__";
const NO_GROUP_TOKEN = "__no_group__";

function GroupSelect({
    value,
    groups,
    onChange,
}: {
    value: string | null;
    groups: string[];
    onChange: (next: string | null) => void;
}) {
    const [newOpen, setNewOpen] = React.useState(false);
    const [newName, setNewName] = React.useState("");

    return (
        <>
            <Select
                value={value || NO_GROUP_TOKEN}
                onValueChange={(v) => {
                    if (v === NEW_GROUP_TOKEN) {
                        setNewName("");
                        setNewOpen(true);
                    } else if (v === NO_GROUP_TOKEN) {
                        onChange(null);
                    } else {
                        onChange(v);
                    }
                }}
            >
                <SelectTrigger className={cn("h-7 border-transparent bg-transparent px-2 text-xs shadow-none hover:border-border hover:bg-background", !value && "italic text-muted-foreground")}>
                    <SelectValue placeholder="No group" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value={NO_GROUP_TOKEN}>No group</SelectItem>
                    {groups.map((g) => (
                        <SelectItem key={g} value={g}>
                            {g}
                        </SelectItem>
                    ))}
                    <SelectItem value={NEW_GROUP_TOKEN} className="text-primary">
                        + New group…
                    </SelectItem>
                </SelectContent>
            </Select>

            <Dialog open={newOpen} onOpenChange={setNewOpen}>
                <DialogContent className="max-w-xs">
                    <DialogHeader>
                        <DialogTitle>New group</DialogTitle>
                    </DialogHeader>
                    <Input
                        autoFocus
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="Group name"
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                const trimmed = newName.trim();
                                if (trimmed) {
                                    onChange(trimmed);
                                    setNewOpen(false);
                                }
                            }
                        }}
                    />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setNewOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={() => {
                                const trimmed = newName.trim();
                                if (trimmed) {
                                    onChange(trimmed);
                                    setNewOpen(false);
                                }
                            }}
                        >
                            Create
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

function SaveIndicator({ status }: { status: SaveStatus }) {
    if (status === "saving") {
        return (
            <span className="flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Saving…
            </span>
        );
    }
    if (status === "saved") {
        return (
            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <Check className="h-3 w-3" /> Saved
            </span>
        );
    }
    if (status === "error") {
        return (
            <span className="flex items-center gap-1 text-destructive">
                <X className="h-3 w-3" /> Save failed
            </span>
        );
    }
    return <span>&nbsp;</span>;
}

function Kbd({ children }: { children: React.ReactNode }) {
    return (
        <kbd className="mx-0.5 inline-block rounded border border-border bg-background px-1 py-0 font-mono text-[10px] text-muted-foreground">
            {children}
        </kbd>
    );
}
