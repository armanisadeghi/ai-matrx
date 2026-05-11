"use client";

// SSR notes editor context menu — parity with UnifiedContextMenu for selection,
// floating Flame menu, admin debug, and prompt execution.

import React, {
  useState,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuLabel,
} from "@/components/ui/context-menu/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { formatEditorSurroundContext } from "@/utils/format-editor-surround-context";
import {
  Save,
  Copy,
  Scissors,
  Clipboard,
  Download,
  Link2,
  Share2,
  FolderInput,
  Flame,
  Trash2,
  X,
  Search,
  FileText,
  Zap,
  Shield,
  StickyNote,
  CheckSquare,
  MessageSquare,
  Database,
  FolderOpen,
  Loader2,
  Building,
  User,
  Type,
  Eye,
  EyeOff,
  Bug,
  Mic,
  Eraser,
  History,
  Undo2,
  Redo2,
} from "lucide-react";
import dynamic from "next/dynamic";
import { getIconComponent } from "@/components/official/icons/IconResolver";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import { selectIsSuperAdmin } from "@/lib/redux/slices/userSlice";
import {
  selectIsDebugMode,
  toggleDebugMode,
  showPromptDebugIndicator,
} from "@/lib/redux/slices/adminDebugSlice";
import {
  toggleOverlay,
  selectIsOverlayOpen,
} from "@/lib/redux/slices/overlaySlice";
import type {
  CategoryGroup,
  ShortcutItem,
  ContentBlockItem,
} from "@/features/prompt-builtins/types/menu";
import { mapScopeToVariables } from "@/features/prompt-builtins/utils/execution";
import { useShortcutTrigger } from "@/features/agents/hooks/useShortcutTrigger";
import type { ApplicationScope } from "@/features/agents/utils/scope-mapping";
import { insertTextAtTextareaCursor } from "@/utils/text-insertion";
import { toast } from "@/components/ui/use-toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useQuickActions } from "@/features/quick-actions/hooks/useQuickActions";
import { getPlacementTypeMeta } from "@/features/prompt-builtins/constants";
import { useNoteContextMenuGroups } from "./useNoteContextMenuGroups";
import { useNoteContextMenuBridge } from "./noteContextMenuBridge";
import { useNoteUndoRedo } from "@/features/notes/hooks/useNoteUndoRedo";

const ContextDebugModal = dynamic(
  () =>
    import("@/components/debug/ContextDebugModal").then((m) => ({
      default: m.ContextDebugModal,
    })),
  { ssr: false, loading: () => null },
);

const FindReplaceModal = dynamic(
  () =>
    import("@/components/modals/FindReplaceModal").then(
      (m) => m.FindReplaceModal,
    ),
  { ssr: false, loading: () => null },
);

// ── Shared menu primitives (ContextMenu + DropdownMenu) ─────────────────────

type MenuKit = {
  Item: typeof ContextMenuItem | typeof DropdownMenuItem;
  Separator: typeof ContextMenuSeparator | typeof DropdownMenuSeparator;
  Sub: typeof ContextMenuSub | typeof DropdownMenuSub;
  SubTrigger: typeof ContextMenuSubTrigger | typeof DropdownMenuSubTrigger;
  SubContent: typeof ContextMenuSubContent | typeof DropdownMenuSubContent;
  Label: typeof ContextMenuLabel | typeof DropdownMenuLabel;
};

export interface NoteContextMenuContentProps {
  noteId: string;
  isDirty: boolean;
  allFolders: string[];
  currentFolder: string | undefined;
  noteContent: string;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  onSave: () => void;
  onDuplicate: () => void;
  onExport: () => void;
  onShareLink: () => void;
  onShareClipboard: () => void;
  onMove: (folder: string) => void;
  onCloseTab: () => void;
  onCloseOtherTabs: () => void;
  onCloseAllTabs: () => void;
  onDelete: () => void;
  onVersionHistory?: () => void;
}

function resolveActiveTextarea(
  target: EventTarget | null,
  textareaRef: React.RefObject<HTMLTextAreaElement | null>,
): HTMLTextAreaElement | null {
  const ta = textareaRef?.current;
  if (!ta) return null;
  const el = target as Node | null;
  if (!el) return ta;
  if (el === ta) return ta;
  if (el instanceof Text && el.parentElement && ta.contains(el.parentElement))
    return ta;
  if (el instanceof HTMLElement && ta.contains(el)) return ta;
  return ta;
}

function GroupIcon({ iconName }: { iconName: string | null }) {
  if (!iconName) return <Flame className="w-3 h-3 shrink-0" />;
  const Icon = getIconComponent(iconName, "Flame");
  return <Icon className="w-3 h-3 shrink-0" />;
}

function ShortcutMenuItem({
  item,
  onExecute,
  Item,
}: {
  item: ShortcutItem;
  onExecute: (item: ShortcutItem) => void;
  Item: MenuKit["Item"];
}) {
  const Icon = item.icon_name
    ? getIconComponent(item.icon_name, "Flame")
    : Flame;
  return (
    <Item
      className="flex items-center gap-2 text-xs [&_svg]:w-3.5 [&_svg]:h-3.5"
      onSelect={() => onExecute(item)}
    >
      <Icon />
      {item.label}
    </Item>
  );
}

function ContentBlockMenuItem({
  item,
  onInsert,
  Item,
}: {
  item: ContentBlockItem;
  onInsert: (item: ContentBlockItem) => void;
  Item: MenuKit["Item"];
}) {
  const Icon = item.icon_name
    ? getIconComponent(item.icon_name, "FileText")
    : FileText;
  return (
    <Item
      className="flex items-center gap-2 text-xs [&_svg]:w-3.5 [&_svg]:h-3.5"
      onSelect={() => onInsert(item)}
    >
      <Icon />
      {item.label}
    </Item>
  );
}

function CategoryItems({
  group,
  depth = 0,
  menu,
  onExecute,
  onInsertBlock,
}: {
  group: CategoryGroup;
  depth?: number;
  menu: MenuKit;
  onExecute: (item: ShortcutItem) => void;
  onInsertBlock: (item: ContentBlockItem) => void;
}) {
  const { Item, Separator, Sub, SubTrigger, SubContent } = menu;
  const shortcuts = group.items.filter(
    (item): item is ShortcutItem => item.type === "prompt_shortcut",
  );
  const contentBlocks = group.items.filter(
    (item): item is ContentBlockItem => item.type === "content_block",
  );
  const hasChildren = group.children && group.children.length > 0;
  const hasItems = shortcuts.length > 0 || contentBlocks.length > 0;

  if (!hasItems && !hasChildren) return null;

  return (
    <Sub>
      <SubTrigger className="flex items-center gap-2 text-xs [&_svg]:w-3.5 [&_svg]:h-3.5">
        <GroupIcon iconName={group.category.icon_name} />
        {group.category.label}
      </SubTrigger>
      <SubContent
        className="min-w-[200px] max-h-[70vh] overflow-y-auto"
        avoidCollisions
        collisionPadding={8}
      >
        {shortcuts.map((item) => (
          <ShortcutMenuItem
            key={item.id}
            item={item}
            onExecute={onExecute}
            Item={Item}
          />
        ))}
        {contentBlocks.map((item) => (
          <ContentBlockMenuItem
            key={item.id}
            item={item}
            onInsert={onInsertBlock}
            Item={Item}
          />
        ))}
        {hasItems && hasChildren && <Separator />}
        {group.children!?.map((child) => (
          <CategoryItems
            key={child.category.id}
            group={child}
            depth={depth + 1}
            menu={menu}
            onExecute={onExecute}
            onInsertBlock={onInsertBlock}
          />
        ))}
      </SubContent>
    </Sub>
  );
}

// ── Heavy chunk: menu panels + Flame (loaded via next/dynamic from NoteContextMenu) ───

export function NoteContextMenuHeavy({
  noteId,
  isDirty,
  allFolders,
  currentFolder,
  noteContent,
  textareaRef,
  onSave,
  onDuplicate,
  onExport,
  onShareLink,
  onShareClipboard,
  onMove,
  onCloseTab,
  onCloseOtherTabs,
  onCloseAllTabs,
  onDelete,
  onVersionHistory,
}: NoteContextMenuContentProps) {
  const bridgeRef = useNoteContextMenuBridge();
  const dispatch = useAppDispatch();
  const isAdmin = useAppSelector(selectIsSuperAdmin);
  const isDebugMode = useAppSelector(selectIsDebugMode);
  const { canUndo, canRedo, undo, redo, undoHint, redoHint } = useNoteUndoRedo({
    noteId,
  });
  const isAdminIndicatorOpen = useAppSelector((state) =>
    selectIsOverlayOpen(state, "adminIndicator"),
  );

  const {
    aiGroups,
    contentBlockGroups,
    organizationToolGroups,
    userToolGroups,
    loading: groupsLoading,
  } = useNoteContextMenuGroups();

  const {
    openQuickNotes,
    openQuickTasks,
    openQuickChat,
    openQuickData,
    openQuickFiles,
    openVoicePad,
  } = useQuickActions();

  const trigger = useShortcutTrigger();

  const [findReplaceOpen, setFindReplaceOpen] = useState(false);
  const [skipSelectionRestore, setSkipSelectionRestore] = useState(false);
  const findReplaceOpenRef = useRef(false);
  const [contextDebugOpen, setContextDebugOpen] = useState(false);
  const [permanentDeleteOpen, setPermanentDeleteOpen] = useState(false);
  const [permanentDeleteBusy, setPermanentDeleteBusy] = useState(false);

  const capturedSelection = useRef<{
    text: string;
    selection: Selection | null;
    range: Range | null;
  } | null>(null);
  const selectionLocked = useRef(false);
  const lastMousePos = useRef<{ x: number; y: number } | null>(null);

  const [selectedText, setSelectedText] = useState("");
  const [selectionRange, setSelectionRange] = useState<{
    type: "editable";
    element: HTMLTextAreaElement;
    start: number;
    end: number;
  } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const [selectionRect, setSelectionRect] = useState<DOMRect | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showFloatingIcon, setShowFloatingIcon] = useState(false);

  useEffect(() => {
    findReplaceOpenRef.current = findReplaceOpen;
  }, [findReplaceOpen]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      lastMousePos.current = { x: e.clientX, y: e.clientY };
    };
    document.addEventListener("mousemove", handleMouseMove, { passive: true });
    return () => document.removeEventListener("mousemove", handleMouseMove);
  }, []);

  useEffect(() => {
    const handleSelection = () => {
      if (selectionLocked.current) return;
      const ta = textareaRef?.current;
      if (ta && document.activeElement === ta) {
        const t = ta.value.slice(ta.selectionStart, ta.selectionEnd);
        setSelectedText(t);
        if (t && window.getSelection()?.rangeCount) {
          try {
            const range = window.getSelection()!.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) setSelectionRect(rect);
          } catch {
            setSelectionRect(null);
          }
        } else if (!t) {
          setSelectionRect(null);
        }
        return;
      }
      const selection = window.getSelection();
      const text = selection?.toString() ?? "";
      setSelectedText(text);
      if (text && selection?.rangeCount) {
        try {
          const range = selection.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) setSelectionRect(rect);
          else if (lastMousePos.current) {
            const fake = {
              left: lastMousePos.current.x - 50,
              right: lastMousePos.current.x + 50,
              top: lastMousePos.current.y - 10,
              bottom: lastMousePos.current.y + 10,
              width: 100,
              height: 20,
              x: lastMousePos.current.x - 50,
              y: lastMousePos.current.y - 10,
              toJSON: () => ({}),
            } as DOMRect;
            setSelectionRect(fake);
          }
        } catch {
          setSelectionRect(null);
        }
      } else {
        setSelectionRect(null);
      }
    };
    document.addEventListener("selectionchange", handleSelection);
    return () =>
      document.removeEventListener("selectionchange", handleSelection);
  }, [textareaRef]);

  useLayoutEffect(() => {
    const shouldShow =
      selectedText.length > 0 &&
      selectionRect !== null &&
      !menuOpen &&
      !dropdownOpen;
    const t = setTimeout(() => setShowFloatingIcon(shouldShow), 200);
    return () => clearTimeout(t);
  }, [selectedText, selectionRect, menuOpen, dropdownOpen]);

  useEffect(() => {
    if (!showFloatingIcon) return;
    const handleScroll = () => {
      setShowFloatingIcon(false);
      setSelectionRect(null);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [showFloatingIcon]);

  const captureTextareaSelection = useCallback((ta: HTMLTextAreaElement) => {
    const start = ta.selectionStart || 0;
    const end = ta.selectionEnd || 0;
    const text = ta.value.substring(start, end);
    capturedSelection.current = {
      text,
      selection: null,
      range: null,
    };
    setSelectedText(text);
    if (text && window.getSelection()?.rangeCount) {
      try {
        const range = window.getSelection()!.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) setSelectionRect(rect);
        else if (lastMousePos.current) {
          setSelectionRect({
            left: lastMousePos.current.x - 50,
            right: lastMousePos.current.x + 50,
            top: lastMousePos.current.y - 10,
            bottom: lastMousePos.current.y + 10,
            width: 100,
            height: 20,
            x: lastMousePos.current.x - 50,
            y: lastMousePos.current.y - 10,
            toJSON: () => ({}),
          } as DOMRect);
        }
      } catch {
        /* ignore */
      }
    }
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 2) return;
      const ta = resolveActiveTextarea(
        e.target,
        textareaRef ?? { current: null },
      );
      if (!ta) return;
      selectionLocked.current = true;
      captureTextareaSelection(ta);
    },
    [textareaRef, captureTextareaSelection],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      const ta = resolveActiveTextarea(
        e.target,
        textareaRef ?? { current: null },
      );
      if (!ta) return;

      let captured = capturedSelection.current;
      if (!captured || !captured.text) {
        const start = ta.selectionStart || 0;
        const end = ta.selectionEnd || 0;
        const text = ta.value.substring(start, end);
        captured = { text, selection: null, range: null };
        capturedSelection.current = captured;
        selectionLocked.current = true;
      }

      const start = ta.selectionStart || 0;
      const end = ta.selectionEnd || 0;
      const text = captured?.text ?? "";
      setSelectedText(text);
      setSelectionRange({
        type: "editable",
        element: ta,
        start,
        end,
      });
      setMenuOpen(true);
    },
    [textareaRef],
  );

  const handleMenuClose = useCallback(() => {
    setMenuOpen(false);
    selectionLocked.current = false;
    capturedSelection.current = null;

    if (skipSelectionRestore) {
      setSkipSelectionRestore(false);
      return;
    }
    if (findReplaceOpen) return;
    if (!selectionRange) return;

    const { element, start, end } = selectionRange;
    setTimeout(() => {
      if (findReplaceOpenRef.current) return;
      element.focus();
      element.setSelectionRange(start, end);
    }, 150);
  }, [skipSelectionRestore, findReplaceOpen, selectionRange]);

  const handleDropdownClose = useCallback((open: boolean) => {
    setDropdownOpen(open);
    if (!open) {
      selectionLocked.current = false;
      capturedSelection.current = null;
      setTimeout(() => {
        setShowFloatingIcon(false);
        setSelectionRect(null);
      }, 100);
    }
  }, []);

  useLayoutEffect(() => {
    bridgeRef.current = {
      onMouseDown: handleMouseDown,
      onContextMenu: handleContextMenu,
      onContextMenuOpenChange: (open: boolean) => {
        if (open) {
          setMenuOpen(true);
        } else {
          handleMenuClose();
        }
      },
    };
    return () => {
      bridgeRef.current = null;
    };
  }, [bridgeRef, handleMouseDown, handleContextMenu, handleMenuClose]);

  const nativeSetValue = (ta: HTMLTextAreaElement, value: string) => {
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    nativeInputValueSetter?.call(ta, value);
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  };

  const handleCopy = useCallback(async () => {
    const t = capturedSelection.current?.text || selectedText;
    if (t) {
      try {
        await navigator.clipboard.writeText(t);
      } catch (err) {
        console.error("Failed to copy:", err);
      }
    }
  }, [selectedText]);

  const handleCut = useCallback(async () => {
    if (!selectionRange) return;
    const element = selectionRange.element;
    const { start, end } = selectionRange;
    const cutText = element.value.substring(start, end);
    try {
      await navigator.clipboard.writeText(cutText);
      const newValue =
        element.value.substring(0, start) + element.value.substring(end);
      nativeSetValue(element, newValue);
      element.setSelectionRange(start, start);
      setSelectionRange(null);
    } catch (err) {
      console.error("Failed to cut:", err);
    }
  }, [selectionRange]);

  const handlePaste = useCallback(async () => {
    if (!selectionRange) return;
    const element = selectionRange.element;
    try {
      const text = await navigator.clipboard.readText();
      const { start, end } = selectionRange;
      const newValue =
        element.value.substring(0, start) + text + element.value.substring(end);
      nativeSetValue(element, newValue);
      element.setSelectionRange(start + text.length, start + text.length);
    } catch (err) {
      console.error("Failed to paste:", err);
    }
  }, [selectionRange]);

  const handleSelectAll = useCallback(() => {
    if (!selectionRange) return;
    const element = selectionRange.element;
    setSelectionRange(null);
    requestAnimationFrame(() => {
      element.focus();
      element.select();
    });
  }, [selectionRange]);

  const handleFind = useCallback(() => {
    setSkipSelectionRestore(true);
    setFindReplaceOpen(true);
    findReplaceOpenRef.current = true;
  }, []);

  /** Cleanup text: collapse 2+ blank lines → 1, trim trailing whitespace per line.
   *  Operates on selection if present, otherwise on the full note content.
   *  Never alters actual words — only whitespace/empty-line cleanup. */
  const handleCleanupText = useCallback(() => {
    if (!selectionRange) return;
    const element = selectionRange.element;
    const hasSelection =
      selectedText && selectionRange.start !== selectionRange.end;
    const start = hasSelection ? selectionRange.start : 0;
    const end = hasSelection ? selectionRange.end : element.value.length;
    const original = element.value.substring(start, end);

    let cleaned = original;
    // Trim trailing whitespace from each line (preserve leading indentation)
    cleaned = cleaned.replace(/[^\S\n]+$/gm, "");
    // Collapse 2+ consecutive blank lines into 1
    cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
    // Remove leading blank lines at the very start
    cleaned = cleaned.replace(/^\n+/, "");
    // Remove trailing blank lines at the very end (leave one newline)
    cleaned = cleaned.replace(/\n+$/, "\n");

    if (cleaned === original) {
      toast({
        title: "Already clean",
        description: "No extra whitespace found.",
      });
      return;
    }

    const newValue =
      element.value.substring(0, start) +
      cleaned +
      element.value.substring(end);
    nativeSetValue(element, newValue);
    element.setSelectionRange(start, start + cleaned.length);

    const linesSaved = original.split("\n").length - cleaned.split("\n").length;
    toast({
      title: "Text cleaned up",
      description: `Removed ${linesSaved} empty line${linesSaved !== 1 ? "s" : ""} and trimmed trailing whitespace.`,
    });
  }, [selectionRange, selectedText]);

  const executeAction = useCallback(
    async (item: ShortcutItem, placementType: string = "ai-action") => {
      const ta = textareaRef?.current;
      const selectionText =
        capturedSelection.current?.text ||
        (ta ? ta.value.substring(ta.selectionStart, ta.selectionEnd) : "");

      const contextPayload = ta
        ? formatEditorSurroundContext(ta.value, {
            selectionStart: ta.selectionStart,
            selectionEnd: ta.selectionEnd,
          })
        : formatEditorSurroundContext(noteContent, {
            selectionStart: 0,
            selectionEnd: 0,
          });

      // Live UI scope passed to the shortcut. The shortcut row owns its own
      // scopeMappings/contextMappings and decides which keys it consumes —
      // unmatched keys are dropped harmlessly by the agent execution path.
      const applicationScope = {
        selection: selectionText,
        content: noteContent,
        context: contextPayload,
      };

      // Admin debug indicator still uses the legacy resolution preview to
      // surface what *would* have been mapped under the prompt-builtin's
      // scope_mappings. The agent shortcut performs its own resolution at
      // launch time; this is purely informational.
      if (isDebugMode) {
        const previewVariables = item.prompt_builtin
          ? mapScopeToVariables(
              applicationScope,
              item.scope_mappings ?? {},
              item.prompt_builtin.variableDefaults ?? [],
            )
          : {};
        dispatch(
          showPromptDebugIndicator({
            promptName: item.label,
            placementType,
            selectedText: selectionText,
            availableContext: applicationScope,
            resolvedVariables: previewVariables,
            canResolve: {
              canResolve: true,
              missingVariables: [],
              resolvedVariables: Object.keys(previewVariables),
            },
            metadata: {
              scopeMappings: item.scope_mappings ?? {},
              availableScopes: item.available_scopes ?? undefined,
            },
          }),
        );
      }

      // TODO(prompt-to-agent-sweep): `item.id` here is a prompt-builtin row id
      // being used as an agent-shortcut id. It works today because the IDs were
      // preserved 1:1 during the prompts→agents migration, but this is brittle —
      // we are not actually consuming agent-shortcut metadata, scopeMappings, or
      // any of the agent system's strengths. Replace once `useNoteContextMenuGroups`
      // is rewritten on top of `useUnifiedAgentContextMenu` so `item` is an
      // `AgentMenuEntry` and the trigger goes through native agent shortcut data.
      // Fire-and-forget agent shortcut launch. The shortcut row carries
      // display mode, auto_run, allow_chat, scopeMappings, etc. — we hand
      // it the live UI scope and let it manage everything downstream.
      try {
        await trigger(item.id, {
          scope: applicationScope as unknown as ApplicationScope,
          sourceFeature: "notes",
        });
      } catch (error) {
        console.error("[NoteContextMenu] Shortcut launch error:", error);
        toast({
          title: "Execution Failed",
          description:
            error instanceof Error
              ? error.message
              : "An unknown error occurred.",
          variant: "destructive",
        });
      }
    },
    [dispatch, isDebugMode, noteContent, textareaRef, trigger],
  );

  const insertBlock = useCallback(
    (item: ContentBlockItem) => {
      const ta = textareaRef?.current;
      if (!ta) {
        toast({
          title: "Cannot Insert Block",
          description: "No active text area found.",
          variant: "destructive",
        });
        return;
      }
      insertTextAtTextareaCursor(ta, item.template);
    },
    [textareaRef],
  );

  /** Replace the current selection with new text */
  const handleReplaceSelection = useCallback(
    (newText: string) => {
      if (!selectionRange) return;
      const element = selectionRange.element;
      const { start, end } = selectionRange;
      const newValue =
        element.value.substring(0, start) +
        newText +
        element.value.substring(end);
      nativeSetValue(element, newValue);
      element.setSelectionRange(start, start + newText.length);
    },
    [selectionRange],
  );

  /** Insert text before the current selection/cursor */
  const handleInsertBefore = useCallback(
    (text: string) => {
      if (!selectionRange) return;
      const element = selectionRange.element;
      const { start } = selectionRange;
      const insertText = text + "\n\n";
      const newValue =
        element.value.substring(0, start) +
        insertText +
        element.value.substring(start);
      nativeSetValue(element, newValue);
      element.setSelectionRange(
        start + insertText.length,
        start + insertText.length,
      );
    },
    [selectionRange],
  );

  /** Insert text after the current selection/cursor */
  const handleInsertAfter = useCallback(
    (text: string) => {
      if (!selectionRange) return;
      const element = selectionRange.element;
      const { end } = selectionRange;
      const insertText = "\n\n" + text;
      const newValue =
        element.value.substring(0, end) +
        insertText +
        element.value.substring(end);
      nativeSetValue(element, newValue);
      element.setSelectionRange(
        end + insertText.length,
        end + insertText.length,
      );
    },
    [selectionRange],
  );

  const buildContextDebugPayload = useCallback(() => {
    const ta = textareaRef?.current;
    const selection =
      capturedSelection.current?.text ||
      (ta ? ta.value.slice(ta.selectionStart, ta.selectionEnd) : "");
    const contextXml = ta
      ? formatEditorSurroundContext(ta.value, {
          selectionStart: ta.selectionStart,
          selectionEnd: ta.selectionEnd,
        })
      : formatEditorSurroundContext(noteContent, {
          selectionStart: 0,
          selectionEnd: 0,
        });
    return {
      selection,
      content: noteContent,
      context: contextXml,
      noteId,
    };
  }, [textareaRef, noteContent, noteId]);

  const [debugPayload, setDebugPayload] = useState(() =>
    buildContextDebugPayload(),
  );

  useEffect(() => {
    if (contextDebugOpen) {
      setDebugPayload(buildContextDebugPayload());
    }
  }, [contextDebugOpen, buildContextDebugPayload]);

  const renderFloatingSelectionIcon = () => {
    const shouldRender = (showFloatingIcon || dropdownOpen) && selectionRect;
    if (!shouldRender) return null;
    if (selectionRect.width <= 0 || selectionRect.height <= 0) return null;

    const isMobile =
      typeof window !== "undefined" &&
      ("ontouchstart" in window ||
        navigator.maxTouchPoints > 0 ||
        window.innerWidth < 768);

    const iconWidth = isMobile ? 48 : 40;
    const iconHeight = isMobile ? 48 : 40;
    const offsetAbove = isMobile ? 12 : 8;
    const centerX = selectionRect.left + selectionRect.width / 2;
    let left = centerX - iconWidth / 2;
    let top = selectionRect.top - iconHeight - offsetAbove;
    const shouldPositionBelow = top < 10;
    const finalTop = shouldPositionBelow
      ? selectionRect.bottom + offsetAbove
      : top;
    const horizontalPadding = isMobile ? 16 : 10;
    const finalLeft = Math.max(
      horizontalPadding,
      Math.min(left, window.innerWidth - iconWidth - horizontalPadding),
    );

    const handleOpen = (
      e: React.MouseEvent | React.TouchEvent | React.KeyboardEvent,
    ) => {
      e.preventDefault();
      e.stopPropagation();
      selectionLocked.current = true;
      const ta = textareaRef?.current;
      if (ta) {
        captureTextareaSelection(ta);
        setSelectionRange({
          type: "editable",
          element: ta,
          start: ta.selectionStart,
          end: ta.selectionEnd,
        });
      }
      setDropdownOpen(true);
    };

    return (
      <button
        type="button"
        onClick={handleOpen}
        onTouchEnd={(e) => {
          e.preventDefault();
          handleOpen(e);
        }}
        className={`fixed z-[9999] flex items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-all duration-200 ${
          dropdownOpen
            ? "opacity-0 pointer-events-none"
            : "hover:shadow-xl hover:scale-110 active:scale-95 animate-in fade-in slide-in-from-top-2"
        } ${isMobile ? "w-12 h-12" : "w-10 h-10"}`}
        style={{
          left: `${finalLeft}px`,
          top: `${finalTop}px`,
          touchAction: "manipulation",
        }}
        aria-label="Open text actions menu"
        role="button"
        tabIndex={dropdownOpen ? -1 : 0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") handleOpen(e);
          if (e.key === "Escape") setShowFloatingIcon(false);
        }}
      >
        <Flame className={isMobile ? "h-6 w-6" : "h-5 w-5"} />
      </button>
    );
  };

  const renderMenuContent = (M: MenuKit) => {
    const { Item, Separator, Sub, SubTrigger, SubContent, Label } = M;
    const selectionHeader = selectedText ? (
      <div className="px-2 py-2 border-b border-border bg-primary/5">
        <div className="flex items-start gap-2">
          <Type className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-primary mb-0.5">
              Selected ({selectedText.length} char
              {selectedText.length !== 1 ? "s" : ""})
            </div>
            <div className="text-xs text-muted-foreground font-mono break-all leading-tight">
              {selectedText.length <= 50
                ? `"${selectedText}"`
                : `"${selectedText.slice(0, 20)}...${selectedText.slice(-20)}"`}
            </div>
          </div>
        </div>
      </div>
    ) : null;

    return (
      <>
        {groupsLoading && (
          <Label className="text-xs text-muted-foreground">Loading...</Label>
        )}
        {selectionHeader}

        <Item
          className="flex items-center gap-2 text-xs [&_svg]:w-3.5 [&_svg]:h-3.5"
          onSelect={handleCopy}
          disabled={!selectedText}
        >
          <Copy /> Copy
        </Item>
        <Item
          className="flex items-center gap-2 text-xs [&_svg]:w-3.5 [&_svg]:h-3.5"
          onSelect={handleCut}
          disabled={!selectedText}
        >
          <Scissors /> Cut
        </Item>
        <Item
          className="flex items-center gap-2 text-xs [&_svg]:w-3.5 [&_svg]:h-3.5"
          onSelect={handlePaste}
        >
          <Clipboard /> Paste
        </Item>
        <Item
          className="flex items-center gap-2 text-xs [&_svg]:w-3.5 [&_svg]:h-3.5"
          onSelect={handleSelectAll}
        >
          <FileText /> Select All
        </Item>
        <Item
          className="flex items-center gap-2 text-xs [&_svg]:w-3.5 [&_svg]:h-3.5"
          onSelect={undo}
          disabled={!canUndo}
        >
          <Undo2 /> Undo
          <span className="ml-auto text-[0.6rem] text-muted-foreground">
            {undoHint}
          </span>
        </Item>
        <Item
          className="flex items-center gap-2 text-xs [&_svg]:w-3.5 [&_svg]:h-3.5"
          onSelect={redo}
          disabled={!canRedo}
        >
          <Redo2 /> Redo
          <span className="ml-auto text-[0.6rem] text-muted-foreground">
            {redoHint}
          </span>
        </Item>

        <Separator />

        <Item
          className="flex items-center gap-2 text-xs [&_svg]:w-3.5 [&_svg]:h-3.5"
          onSelect={handleFind}
        >
          <Search /> Find & Replace
        </Item>
        <Item
          className="flex items-center gap-2 text-xs [&_svg]:w-3.5 [&_svg]:h-3.5"
          onSelect={handleCleanupText}
        >
          <Eraser /> {selectedText ? "Cleanup Selection" : "Cleanup Text"}
        </Item>

        <Separator />

        {isDirty && (
          <Item
            className="flex items-center gap-2 text-xs [&_svg]:w-3.5 [&_svg]:h-3.5"
            onSelect={onSave}
          >
            <Save /> Save
          </Item>
        )}
        <Item
          className="flex items-center gap-2 text-xs [&_svg]:w-3.5 [&_svg]:h-3.5"
          onSelect={onDuplicate}
        >
          <Copy /> Duplicate
        </Item>
        <Item
          className="flex items-center gap-2 text-xs [&_svg]:w-3.5 [&_svg]:h-3.5"
          onSelect={onExport}
        >
          <Download /> Export as Markdown
        </Item>
        {onVersionHistory && (
          <Item
            className="flex items-center gap-2 text-xs [&_svg]:w-3.5 [&_svg]:h-3.5"
            onSelect={onVersionHistory}
          >
            <History /> Version History
          </Item>
        )}
        <Item
          className="flex items-center gap-2 text-xs [&_svg]:w-3.5 [&_svg]:h-3.5"
          onSelect={onShareLink}
        >
          <Link2 /> Share Link
        </Item>
        <Item
          className="flex items-center gap-2 text-xs [&_svg]:w-3.5 [&_svg]:h-3.5"
          onSelect={onShareClipboard}
        >
          <Share2 /> Copy to Clipboard
        </Item>

        <Separator />

        <Sub>
          <SubTrigger className="flex items-center gap-2 text-xs [&_svg]:w-3.5 [&_svg]:h-3.5">
            <FolderInput /> Move to Folder
          </SubTrigger>
          <SubContent
            className="min-w-[180px] max-h-[70vh] overflow-y-auto"
            avoidCollisions
            collisionPadding={8}
          >
            {allFolders.map((folder) => {
              const isCurrent = currentFolder === folder;
              return (
                <Item
                  key={folder}
                  className={`flex items-center gap-2 text-xs [&_svg]:w-3.5 [&_svg]:h-3.5 ${
                    isCurrent ? "text-amber-600 dark:text-amber-400" : ""
                  }`}
                  onSelect={() => !isCurrent && onMove(folder)}
                  disabled={isCurrent}
                >
                  <FolderInput />
                  {folder}
                  {isCurrent && (
                    <span className="ml-auto text-[0.625rem] opacity-50">
                      current
                    </span>
                  )}
                </Item>
              );
            })}
          </SubContent>
        </Sub>

        <Separator />

        <Sub>
          <SubTrigger className="flex items-center gap-2 text-xs [&_svg]:w-3.5 [&_svg]:h-3.5 text-purple-600 dark:text-purple-400 [&_svg]:text-purple-500">
            <Flame /> AI Actions
            {groupsLoading && (
              <Loader2 className="w-3 h-3 animate-spin ml-auto opacity-50" />
            )}
          </SubTrigger>
          <SubContent
            className="min-w-[220px] max-h-[70vh] overflow-y-auto"
            avoidCollisions
            collisionPadding={8}
          >
            {groupsLoading ? (
              <div className="flex items-center gap-1.5 px-2 py-2 text-xs text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" /> Loading...
              </div>
            ) : aiGroups.length === 0 ? (
              <div className="px-2 py-2 text-xs text-muted-foreground italic">
                No AI actions available
              </div>
            ) : (
              aiGroups.map((group) => (
                <CategoryItems
                  key={group.category.id}
                  group={group}
                  menu={M}
                  onExecute={(item) =>
                    executeAction(item, group.category.placement_type)
                  }
                  onInsertBlock={insertBlock}
                />
              ))
            )}
          </SubContent>
        </Sub>

        {contentBlockGroups.length > 0 && (
          <Sub>
            <SubTrigger className="flex items-center gap-2 text-xs [&_svg]:w-3.5 [&_svg]:h-3.5">
              <FileText /> Content Blocks
            </SubTrigger>
            <SubContent
              className="min-w-[220px] max-h-[70vh] overflow-y-auto"
              avoidCollisions
              collisionPadding={8}
            >
              {contentBlockGroups.map((group) => (
                <CategoryItems
                  key={group.category.id}
                  group={group}
                  menu={M}
                  onExecute={(item) =>
                    executeAction(item, group.category.placement_type)
                  }
                  onInsertBlock={insertBlock}
                />
              ))}
            </SubContent>
          </Sub>
        )}

        {organizationToolGroups.length > 0 && (
          <Sub>
            <SubTrigger className="flex items-center gap-2 text-xs [&_svg]:w-3.5 [&_svg]:h-3.5">
              <Building />
              {getPlacementTypeMeta("organization-tool").label}
            </SubTrigger>
            <SubContent
              className="min-w-[220px] max-h-[70vh] overflow-y-auto"
              avoidCollisions
              collisionPadding={8}
            >
              {organizationToolGroups.map((group) => (
                <CategoryItems
                  key={group.category.id}
                  group={group}
                  menu={M}
                  onExecute={(item) =>
                    executeAction(item, group.category.placement_type)
                  }
                  onInsertBlock={insertBlock}
                />
              ))}
            </SubContent>
          </Sub>
        )}

        {userToolGroups.length > 0 && (
          <Sub>
            <SubTrigger className="flex items-center gap-2 text-xs [&_svg]:w-3.5 [&_svg]:h-3.5">
              <User /> {getPlacementTypeMeta("user-tool").label}
            </SubTrigger>
            <SubContent
              className="min-w-[220px] max-h-[70vh] overflow-y-auto"
              avoidCollisions
              collisionPadding={8}
            >
              {userToolGroups.map((group) => (
                <CategoryItems
                  key={group.category.id}
                  group={group}
                  menu={M}
                  onExecute={(item) =>
                    executeAction(item, group.category.placement_type)
                  }
                  onInsertBlock={insertBlock}
                />
              ))}
            </SubContent>
          </Sub>
        )}

        <Sub>
          <SubTrigger className="flex items-center gap-2 text-xs [&_svg]:w-3.5 [&_svg]:h-3.5">
            <Zap /> Quick Actions
          </SubTrigger>
          <SubContent
            className="min-w-[200px]"
            avoidCollisions
            collisionPadding={8}
          >
            <Item
              className="flex items-center gap-2 text-xs [&_svg]:w-3.5 [&_svg]:h-3.5"
              onSelect={openQuickNotes}
            >
              <StickyNote /> Quick Notes
            </Item>
            <Item
              className="flex items-center gap-2 text-xs [&_svg]:w-3.5 [&_svg]:h-3.5"
              onSelect={openQuickTasks}
            >
              <CheckSquare /> Quick Tasks
            </Item>
            <Item
              className="flex items-center gap-2 text-xs [&_svg]:w-3.5 [&_svg]:h-3.5"
              onSelect={openQuickChat}
            >
              <MessageSquare /> Quick Chat
            </Item>
            <Item
              className="flex items-center gap-2 text-xs [&_svg]:w-3.5 [&_svg]:h-3.5"
              onSelect={openQuickData}
            >
              <Database /> Quick Data
            </Item>
            <Item
              className="flex items-center gap-2 text-xs [&_svg]:w-3.5 [&_svg]:h-3.5"
              onSelect={openQuickFiles}
            >
              <FolderOpen /> Quick Files
            </Item>
            <Item
              className="flex items-center gap-2 text-xs [&_svg]:w-3.5 [&_svg]:h-3.5"
              onSelect={openVoicePad}
            >
              <Mic /> Voice Input
            </Item>
          </SubContent>
        </Sub>

        {isAdmin && (
          <>
            <Separator />
            <Sub>
              <SubTrigger className="flex items-center gap-2 text-xs [&_svg]:w-3.5 [&_svg]:h-3.5 text-amber-600 dark:text-amber-400">
                <Shield /> Admin Tools
              </SubTrigger>
              <SubContent
                className="min-w-[200px]"
                avoidCollisions
                collisionPadding={8}
              >
                <Item
                  className="flex items-center gap-2 text-xs [&_svg]:w-3.5 [&_svg]:h-3.5"
                  onSelect={() => dispatch(toggleDebugMode())}
                >
                  {isDebugMode ? (
                    <EyeOff className="text-amber-600 dark:text-amber-400" />
                  ) : (
                    <Eye />
                  )}
                  <div className="flex flex-col">
                    <span>{isDebugMode ? "Disable" : "Enable"} Debug Mode</span>
                    <span className="text-xs text-muted-foreground">
                      {isDebugMode ? "Hide debug info" : "Show debug info"}
                    </span>
                  </div>
                </Item>
                {isDebugMode && (
                  <Item
                    className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 [&_svg]:w-3.5 [&_svg]:h-3.5"
                    onSelect={() => setContextDebugOpen(true)}
                  >
                    <Bug />
                    <div className="flex flex-col">
                      <span>Inspect Context</span>
                      <span className="text-xs text-muted-foreground">
                        View selection &amp; scopes
                      </span>
                    </div>
                  </Item>
                )}
                <Separator />
                <Item
                  className="flex items-center gap-2 text-xs [&_svg]:w-3.5 [&_svg]:h-3.5"
                  onSelect={() =>
                    dispatch(toggleOverlay({ overlayId: "adminIndicator" }))
                  }
                >
                  {isAdminIndicatorOpen ? (
                    <Eye className="text-green-600 dark:text-green-400" />
                  ) : (
                    <EyeOff />
                  )}
                  <div className="flex flex-col">
                    <span>
                      {isAdminIndicatorOpen ? "Hide" : "Show"} Admin Indicator
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Floating debug overlay
                    </span>
                  </div>
                </Item>
              </SubContent>
            </Sub>
          </>
        )}

        <Separator />

        <Item
          className="flex items-center gap-2 text-xs [&_svg]:w-3.5 [&_svg]:h-3.5"
          onSelect={onCloseTab}
        >
          <X /> Close Tab
        </Item>
        <Item
          className="flex items-center gap-2 text-xs [&_svg]:w-3.5 [&_svg]:h-3.5"
          onSelect={onCloseOtherTabs}
        >
          <X /> Close Other Tabs
        </Item>
        <Item
          className="flex items-center gap-2 text-xs [&_svg]:w-3.5 [&_svg]:h-3.5"
          onSelect={onCloseAllTabs}
        >
          <X /> Close All Tabs
        </Item>

        <Separator />

        <Item
          className="flex items-center gap-2 text-xs text-destructive focus:text-destructive [&_svg]:w-3.5 [&_svg]:h-3.5"
          onSelect={onDelete}
        >
          <Trash2 /> Delete Note
        </Item>
        {isAdmin && (
          <Item
            className="flex items-center gap-2 text-xs text-destructive focus:text-destructive [&_svg]:w-3.5 [&_svg]:h-3.5"
            onSelect={() => setPermanentDeleteOpen(true)}
          >
            <Trash2 /> Permanently Delete
          </Item>
        )}
      </>
    );
  };

  const contextMenuKit: MenuKit = {
    Item: ContextMenuItem,
    Separator: ContextMenuSeparator,
    Sub: ContextMenuSub,
    SubTrigger: ContextMenuSubTrigger,
    SubContent: ContextMenuSubContent,
    Label: ContextMenuLabel,
  };

  const dropdownMenuKit: MenuKit = {
    Item: DropdownMenuItem,
    Separator: DropdownMenuSeparator,
    Sub: DropdownMenuSub,
    SubTrigger: DropdownMenuSubTrigger,
    SubContent: DropdownMenuSubContent,
    Label: DropdownMenuLabel,
  };

  return (
    <>
      <ContextMenuContent
        className="min-w-[220px] max-w-[280px]"
        avoidCollisions
        collisionPadding={8}
      >
        {renderMenuContent(contextMenuKit)}
      </ContextMenuContent>

      <DropdownMenu open={dropdownOpen} onOpenChange={handleDropdownClose}>
        <DropdownMenuTrigger asChild>
          {renderFloatingSelectionIcon() || (
            <div style={{ display: "none" }} aria-hidden />
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-64 max-h-[70vh] overflow-y-auto"
          align="center"
          side="bottom"
          sideOffset={5}
        >
          {renderMenuContent(dropdownMenuKit)}
        </DropdownMenuContent>
      </DropdownMenu>

      {isDebugMode && (
        <ContextDebugModal
          isOpen={contextDebugOpen}
          onClose={() => setContextDebugOpen(false)}
          contextData={debugPayload}
        />
      )}

      {findReplaceOpen && (
        <FindReplaceModal
          isOpen={findReplaceOpen}
          onClose={() => {
            setFindReplaceOpen(false);
            findReplaceOpenRef.current = false;
          }}
          targetElement={textareaRef?.current}
          onReplace={(newText) => {
            const ta = textareaRef?.current;
            if (!ta) return;
            nativeSetValue(ta, newText);
          }}
        />
      )}

      <ConfirmDialog
        open={permanentDeleteOpen}
        onOpenChange={(open) => {
          if (!open && !permanentDeleteBusy) setPermanentDeleteOpen(false);
        }}
        title="Permanently delete note"
        description="Permanently delete this note? This cannot be undone."
        confirmLabel="Permanently delete"
        variant="destructive"
        busy={permanentDeleteBusy}
        onConfirm={async () => {
          setPermanentDeleteBusy(true);
          try {
            const { permanentlyDeleteNote } =
              await import("@/features/notes/service/notesService");
            await permanentlyDeleteNote(noteId);
            onDelete();
            toast({ title: "Note permanently deleted" });
            setPermanentDeleteOpen(false);
          } catch (err) {
            toast({
              title: "Failed to permanently delete",
              variant: "destructive",
            });
          } finally {
            setPermanentDeleteBusy(false);
          }
        }}
      />
    </>
  );
}
