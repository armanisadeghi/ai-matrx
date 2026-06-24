/**
 * UnifiedContextMenu
 *
 * App-wide context menu that dynamically loads shortcuts from the database.
 * Supports multiple placement types:
 * - AI Actions (ai-action)
 * - Content Blocks (content-block)
 * - Organization Tools (organization-tool)
 * - User Tools (user-tool)
 * - Quick Actions (hard-coded for now, will be migrated to DB)
 *
 * Use this anywhere text is displayed or editable.
 */

"use client";

import React, { useState } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
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
import {
  StickyNote,
  CheckSquare,
  MessageSquare,
  Database,
  FolderOpen,
  Lightbulb,
  FileText,
  Zap,
  Building,
  User,
  Scissors,
  Copy,
  Clipboard,
  Type,
  Search,
  Bug,
  Eye,
  EyeOff,
  Settings,
  Shield,
  AlertCircle,
  AlertTriangle,
  Mic,
  Undo2,
  Redo2,
  History,
} from "lucide-react";
import { useUnifiedContextMenu } from "@/features/prompt-builtins/hooks/useUnifiedContextMenu";
import {
  PLACEMENT_TYPES,
  PLACEMENT_TYPE_META,
} from "@/features/prompt-builtins/constants";
import { mapScopeToVariables } from "@/features/prompt-builtins/utils/execution";
import { useShortcutTrigger } from "@/features/agents/hooks/useShortcutTrigger";
import type { ApplicationScope } from "@/features/agents/utils/scope-mapping";
import type {
  MenuItem,
  ContentBlockItem,
  ShortcutItem,
} from "@/features/prompt-builtins/types/menu";
import { TextActionResultModal } from "@/components/modals/TextActionResultModal";
import { FindReplaceModal } from "@/components/modals/FindReplaceModal";
import { useQuickActions } from "@/features/quick-actions/hooks/useQuickActions";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import {
  selectIsDebugMode,
  toggleDebugMode,
  showPromptDebugIndicator,
} from "@/lib/redux/preferences/adminDebugSlice";
import { selectIsSuperAdmin } from "@/lib/redux/slices/userSlice";
import {
  selectIsOverlayOpen,
  toggleOverlay,
} from "@/lib/redux/slices/overlaySlice";
import { ContextDebugModal } from "@/components/debug/ContextDebugModal";
import { extractErrorMessage } from "@/utils/errors";
import IconResolver from "@/components/official/icons/IconResolver";
import { toast } from "@/components/ui/use-toast";

interface UnifiedContextMenuProps {
  children: React.ReactNode;
  /** For rich text editors: provide editor ID */
  editorId?: string;
  /** For textareas: provide getter function */
  getTextarea?: () => HTMLTextAreaElement | null;
  /** Callback after content inserted */
  onContentInserted?: () => void;
  /** For text editors: text replacement callbacks */
  onTextReplace?: (newText: string) => void;
  onTextInsertBefore?: (text: string) => void;
  onTextInsertAfter?: (text: string) => void;
  /** Is this wrapping an editable element? */
  isEditable?: boolean;
  /** Enable/disable specific placement types */
  enabledPlacements?: string[];
  /**
   * Context data for scope mapping
   *
   * Standard scopes (automatically handled):
   * - selection: Captured automatically from user's text selection
   *
   * Configurable scopes (set per usage):
   * - content: Primary content (e.g., full text of textarea, code file, note)
   * - context: Broader context (e.g., imported files, open tabs, surrounding data)
   *
   * Custom variables (usage-specific):
   * - Any custom key-value pairs for special shortcuts
   * - Examples: ts_errors, terminal_output, file_path, etc.
   *
   * Example usage in code editor:
   * {
   *   content: fullCodeFile,
   *   context: importedFiles + openTabs,
   *   ts_errors: typescriptErrors,
   *   terminal_output: recentTerminalOutput
   * }
   */
  contextData?: {
    /** Primary content - main text/data being worked with */
    content?: string;
    /** Broader context - surrounding or related information */
    context?: string;
    /** Context filter for enabled_contexts filtering */
    contextFilter?: string;
    /** Any custom variables for shortcuts */
    [key: string]: any;
  };
  className?: string;
  /** Enable floating icon on text selection (default: true) */
  enableFloatingIcon?: boolean;
  /** Undo callback — if provided, an Undo menu item appears in browser actions */
  onUndo?: () => void;
  /** Redo callback — if provided, a Redo menu item appears in browser actions */
  onRedo?: () => void;
  /** Whether undo is currently available (controls disabled state) */
  canUndo?: boolean;
  /** Whether redo is currently available (controls disabled state) */
  canRedo?: boolean;
  /** Shortcut hint for undo (e.g. "⌘Z" or "Ctrl+Z") */
  undoHint?: string;
  /** Shortcut hint for redo (e.g. "⇧⌘Z" or "Ctrl+Y") */
  redoHint?: string;
  /** Callback to open the full undo/redo history overlay */
  onViewHistory?: () => void;
  /** Whether there is any history to view (controls disabled state) */
  hasHistory?: boolean;
}

export function UnifiedContextMenu({
  children,
  editorId,
  getTextarea,
  onContentInserted,
  onTextReplace,
  onTextInsertBefore,
  onTextInsertAfter,
  isEditable = false,
  enabledPlacements = [
    PLACEMENT_TYPES.AI_ACTION,
    PLACEMENT_TYPES.CONTENT_BLOCK,
    PLACEMENT_TYPES.ORGANIZATION_TOOL,
    PLACEMENT_TYPES.USER_TOOL,
    "quick-action", // Hard-coded for now
  ],
  contextData = {},
  className,
  enableFloatingIcon = true,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  undoHint,
  redoHint,
  onViewHistory,
  hasHistory = false,
}: UnifiedContextMenuProps) {
  // Determine which placement types to load from DB (everything except quick-action)
  const dbPlacementTypes = enabledPlacements.filter(
    (p) => p !== "quick-action",
  );

  // Load ALL menu items (shortcuts + content blocks) from unified view
  // Extract contextFilter from contextData if provided
  const contextFilter = contextData?.contextFilter as string | undefined;
  const { categoryGroups, loading } = useUnifiedContextMenu(
    dbPlacementTypes,
    contextFilter, // Pass context filter for filtering by enabled_contexts
    dbPlacementTypes.length > 0,
  );

  // TODO(prompt-to-agent-sweep): Shortcut launches now go through the agent
  // execution system via `useShortcutTrigger`. This works today only because
  // `prompt_shortcuts.id == agx_shortcut.id` from the prompts→agents 1:1
  // migration, so the same id passed by the legacy
  // `context_menu_unified_view` resolves to a real `agx_shortcut` row. We're
  // not yet consuming agent-shortcut metadata, scopeMappings, or any of the
  // agent system's strengths — and inline text-replacement callbacks
  // (`onTextReplace` / `onTextInsertBefore` / `onTextInsertAfter`) are
  // currently dropped on the floor for `result_display === "inline"`
  // shortcuts. Replace once this menu reads from `useUnifiedAgentContextMenu`
  // (features/context-menu-v2) and routes inline text mutation through the
  // `WidgetHandle` system instead of the legacy callback bag.
  const trigger = useShortcutTrigger();

  // Quick Actions via Redux (hard-coded)
  const {
    openQuickNotes,
    openQuickTasks,
    openQuickChat,
    openQuickData,
    openQuickFiles,
    openVoicePad,
  } = useQuickActions();

  // Admin features
  const dispatch = useAppDispatch();
  const isAdmin = useAppSelector(selectIsSuperAdmin);
  const isDebugMode = useAppSelector(selectIsDebugMode);
  const isAdminIndicatorOpen = useAppSelector((state) =>
    selectIsOverlayOpen(state, "adminIndicator"),
  );

  const [contextDebugOpen, setContextDebugOpen] = useState(false);

  // Selection tracking
  const [selectedText, setSelectedText] = useState<string>("");
  const [selectionRange, setSelectionRange] = useState<{
    type: "editable" | "non-editable";
    // For editable elements
    element: HTMLElement | null;
    start: number;
    end: number;
    // For non-editable elements
    range?: Range | null;
    containerElement?: HTMLElement | null;
  } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // Store selection persistently to prevent Mac clearing issue
  // This ref holds the selection and won't be overwritten by selectionchange events
  const capturedSelection = React.useRef<{
    text: string;
    selection: Selection | null;
    range: Range | null;
  } | null>(null);

  // Lock to prevent selectionchange from overwriting captured selection
  const selectionLocked = React.useRef(false);

  // Text result modal
  const [textResultModalOpen, setTextResultModalOpen] = useState(false);
  const [textResultData, setTextResultData] = useState<{
    original: string;
    result: string;
    promptName: string;
  } | null>(null);

  // Find/Replace modal
  const [findReplaceOpen, setFindReplaceOpen] = useState(false);
  const [skipSelectionRestore, setSkipSelectionRestore] = useState(false);
  const findReplaceOpenRef = React.useRef(false);

  // Floating selection icon state
  const [selectionRect, setSelectionRect] = useState<DOMRect | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showFloatingIcon, setShowFloatingIcon] = useState(false);

  // Track mouse position for fallback positioning (textareas)
  const lastMousePos = React.useRef<{ x: number; y: number } | null>(null);

  // Track selection (but don't overwrite if locked for context menu)
  React.useEffect(() => {
    const handleSelection = () => {
      // Don't update if selection is locked for context menu (Mac fix)
      if (selectionLocked.current) {
        return;
      }

      const selection = window.getSelection();
      const text = selection?.toString().trim() || "";
      setSelectedText(text);

      // Update selection rect for floating icon
      // Always use window.getSelection() for positioning, even for textareas
      if (text && selection && selection.rangeCount > 0) {
        try {
          const range = selection.getRangeAt(0);
          const rect = range.getBoundingClientRect();

          // Only update if rect has valid dimensions (not collapsed/zero)
          // This prevents overwriting a good rect with zeros
          if (rect.width > 0 && rect.height > 0) {
            if (isDebugMode) {
              console.log("[UnifiedContextMenu] Selection rect (valid):", {
                text,
                rect: {
                  top: rect.top,
                  left: rect.left,
                  width: rect.width,
                  height: rect.height,
                  bottom: rect.bottom,
                  right: rect.right,
                },
              });
            }

            setSelectionRect(rect);
          } else {
            // Fallback for textareas: use last mouse position
            if (lastMousePos.current) {
              // Create a fake rect at mouse position
              const fakeRect = {
                left: lastMousePos.current.x - 50, // Center the icon around cursor
                right: lastMousePos.current.x + 50,
                top: lastMousePos.current.y - 10,
                bottom: lastMousePos.current.y + 10,
                width: 100,
                height: 20,
                x: lastMousePos.current.x - 50,
                y: lastMousePos.current.y - 10,
                toJSON: () => ({}),
              } as DOMRect;

              setSelectionRect(fakeRect);

              if (isDebugMode) {
                console.log(
                  "[UnifiedContextMenu] Selection rect (fallback from mouse position):",
                  {
                    text,
                    mousePos: lastMousePos.current,
                    fakeRect: {
                      top: fakeRect.top,
                      left: fakeRect.left,
                      width: fakeRect.width,
                      height: fakeRect.height,
                    },
                  },
                );
              }
            } else if (isDebugMode) {
              console.log(
                "[UnifiedContextMenu] Selection rect (invalid - zero dimensions, no mouse pos):",
                {
                  text,
                  rect: {
                    width: rect.width,
                    height: rect.height,
                  },
                },
              );
            }
          }
        } catch (error) {
          console.error(
            "[UnifiedContextMenu] Error getting selection rect:",
            error,
          );
          setSelectionRect(null);
        }
      } else {
        setSelectionRect(null);
      }
    };

    document.addEventListener("selectionchange", handleSelection);
    return () =>
      document.removeEventListener("selectionchange", handleSelection);
  }, [isDebugMode]);

  // Capture selection on mousedown (right button) - EARLIEST possible point (Mac fix)
  const handleMouseDown = (e: React.MouseEvent) => {
    // Only capture on right mouse button (button 2)
    if (e.button !== 2) return;

    const target = e.target as HTMLElement;

    // Lock selection updates to prevent selectionchange from clearing our capture
    selectionLocked.current = true;

    // For textareas and inputs, capture their selection immediately
    if (
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLInputElement
    ) {
      const start = target.selectionStart || 0;
      const end = target.selectionEnd || 0;
      const text = target.value.substring(start, end);

      capturedSelection.current = {
        text,
        selection: null,
        range: null,
      };

      // Capture selection bounds for floating icon
      // Use window.getSelection() even for textareas to get actual selection position
      if (text) {
        try {
          const selection = window.getSelection();
          if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();

            // Only set if rect has valid dimensions
            if (rect.width > 0 && rect.height > 0) {
              setSelectionRect(rect);

              if (isDebugMode) {
                console.log(
                  "[UnifiedContextMenu] Captured textarea selection rect:",
                  {
                    text,
                    rect: {
                      top: rect.top,
                      left: rect.left,
                      width: rect.width,
                      height: rect.height,
                    },
                  },
                );
              }
            } else if (lastMousePos.current) {
              // Fallback: use mouse position for textareas
              const fakeRect = {
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

              setSelectionRect(fakeRect);

              if (isDebugMode) {
                console.log(
                  "[UnifiedContextMenu] Captured textarea selection rect (fallback):",
                  {
                    text,
                    mousePos: lastMousePos.current,
                  },
                );
              }
            }
          }
        } catch (error) {
          console.error(
            "[UnifiedContextMenu] Failed to get selection bounds:",
            error,
          );
        }
      }

      // Also update state immediately
      setSelectedText(text);

      if (isDebugMode) {
        console.log(
          "[UnifiedContextMenu] Captured editable selection on mousedown:",
          { text, length: text.length },
        );
      }
    } else {
      // For non-editable elements, capture the current selection
      const selection = window.getSelection();
      const text = selection?.toString() || "";
      let range: Range | null = null;

      if (selection && selection.rangeCount > 0) {
        try {
          range = selection.getRangeAt(0).cloneRange();
          // Capture selection bounds for floating icon
          if (text) {
            const rect = range.getBoundingClientRect();

            // Only set if rect has valid dimensions
            if (rect.width > 0 && rect.height > 0) {
              setSelectionRect(rect);

              if (isDebugMode) {
                console.log(
                  "[UnifiedContextMenu] Captured non-editable selection rect:",
                  {
                    text,
                    rect: {
                      top: rect.top,
                      left: rect.left,
                      width: rect.width,
                      height: rect.height,
                    },
                  },
                );
              }
            }
          }
        } catch (error) {
          console.error("[UnifiedContextMenu] Failed to clone range:", error);
        }
      }

      capturedSelection.current = {
        text,
        selection,
        range,
      };

      // Also update state immediately
      setSelectedText(text);

      if (isDebugMode) {
        console.log(
          "[UnifiedContextMenu] Captured non-editable selection on mousedown:",
          { text, length: text.length, hasRange: !!range },
        );
      }
    }
  };

  // Keep ref in sync with state for reliable closure access
  React.useEffect(() => {
    findReplaceOpenRef.current = findReplaceOpen;
  }, [findReplaceOpen]);

  // Show/hide floating icon with debouncing
  React.useEffect(() => {
    const shouldShow =
      enableFloatingIcon &&
      selectedText.length > 0 &&
      selectionRect !== null &&
      !menuOpen &&
      !dropdownOpen;

    // Debounce showing the icon to prevent flickering during selection
    const timer = setTimeout(() => {
      setShowFloatingIcon(shouldShow);
    }, 200);

    return () => clearTimeout(timer);
  }, [enableFloatingIcon, selectedText, selectionRect, menuOpen, dropdownOpen]);

  // Hide floating icon on scroll
  React.useEffect(() => {
    if (!showFloatingIcon) return;

    const handleScroll = () => {
      setShowFloatingIcon(false);
      setSelectionRect(null);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [showFloatingIcon]);

  // Track mouse position for fallback positioning (needed for textareas)
  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      lastMousePos.current = { x: e.clientX, y: e.clientY };
    };

    document.addEventListener("mousemove", handleMouseMove, { passive: true });
    return () => document.removeEventListener("mousemove", handleMouseMove);
  }, []);

  const handleContextMenu = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;

    // Use captured selection from mousedown (Mac fix)
    let captured = capturedSelection.current;

    if (isDebugMode) {
      console.log("[UnifiedContextMenu] Context menu opened:", {
        capturedText: captured?.text,
        capturedLength: captured?.text?.length || 0,
        hasRange: !!captured?.range,
      });
    }

    // ADDITIONAL SAFEGUARD: If mousedown didn't capture (possible on Mac), try again now
    if (!captured || !captured.text) {
      if (isDebugMode) {
        console.log(
          "[UnifiedContextMenu] No captured selection, trying to capture now (fallback)",
        );
      }
      if (
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLInputElement
      ) {
        const start = target.selectionStart || 0;
        const end = target.selectionEnd || 0;
        const text = target.value.substring(start, end);

        captured = {
          text,
          selection: null,
          range: null,
        };
        capturedSelection.current = captured;
        selectionLocked.current = true;
      } else {
        const selection = window.getSelection();
        const text = selection?.toString() || "";
        let range: Range | null = null;

        if (selection && selection.rangeCount > 0) {
          try {
            range = selection.getRangeAt(0).cloneRange();
          } catch (error) {
            console.error("[UnifiedContextMenu] Failed to clone range:", error);
          }
        }

        captured = {
          text,
          selection,
          range,
        };
        capturedSelection.current = captured;
        selectionLocked.current = true;
      }
    }

    // EDITABLE PATH: textareas and inputs
    if (
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLInputElement
    ) {
      const start = target.selectionStart || 0;
      const end = target.selectionEnd || 0;
      // Use captured text
      const text = captured?.text || "";

      setSelectedText(text);
      setSelectionRange({
        type: "editable",
        element: target,
        start,
        end,
        range: null,
        containerElement: null,
      });
      setMenuOpen(true);
    } else {
      // NON-EDITABLE PATH: regular elements with text selection
      // Use captured selection/range
      const text = captured?.text || "";
      let range: Range | null = captured?.range || null;

      // Find the closest context menu container
      let containerElement = e.currentTarget as HTMLElement;
      if (containerElement.hasAttribute("data-radix-context-menu-trigger")) {
        // Already the trigger
      } else {
        // Search for the trigger within currentTarget
        const trigger = containerElement.querySelector(
          "[data-radix-context-menu-trigger]",
        );
        if (trigger instanceof HTMLElement) {
          containerElement = trigger;
        }
      }

      setSelectedText(text);
      setSelectionRange({
        type: "non-editable",
        element: null,
        start: 0,
        end: 0,
        range,
        containerElement,
      });
      setMenuOpen(true);
    }
  };

  // Restore selection when menu closes
  const handleMenuClose = () => {
    setMenuOpen(false);

    // Unlock selection updates (Mac fix)
    selectionLocked.current = false;
    capturedSelection.current = null;

    // Skip restoration if a modal is opening (like Find/Replace)
    if (skipSelectionRestore) {
      setSkipSelectionRestore(false);
      return;
    }

    // Also skip if Find/Replace modal is open
    if (findReplaceOpen) {
      return;
    }

    if (!selectionRange) return;

    if (selectionRange.type === "editable") {
      // EDITABLE PATH: Restore textarea/input selection
      const { element, start, end } = selectionRange;
      if (
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLInputElement
      ) {
        // Longer delay to wait for menu animation to complete
        setTimeout(() => {
          // Double-check that Find modal isn't open (use ref for reliable closure access)
          if (findReplaceOpenRef.current) return;

          element.focus();
          element.setSelectionRange(start, end);
        }, 150); // Increased delay for reliable restoration
      }
    } else {
      // NON-EDITABLE PATH: Restore DOM selection using Range
      const { range } = selectionRange;
      if (range) {
        setTimeout(() => {
          try {
            const selection = window.getSelection();
            if (selection) {
              selection.removeAllRanges();
              selection.addRange(range);
            }
          } catch (error) {
            console.error(
              "[UnifiedContextMenu] Failed to restore selection:",
              error,
            );
          }
        }, 50); // Shorter delay for non-editable since no focus needed
      }
    }
  };

  // Browser action handlers
  const handleCut = async () => {
    if (!selectionRange) return;

    if (selectionRange.type === "editable") {
      const element = selectionRange.element;
      if (
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLInputElement
      ) {
        const { start, end } = selectionRange;
        const cutText = element.value.substring(start, end);

        try {
          // Modern Clipboard API
          await navigator.clipboard.writeText(cutText);

          // Remove the selected text
          const newValue =
            element.value.substring(0, start) + element.value.substring(end);

          // Update via callback if available, otherwise direct
          if (onTextReplace) {
            onTextReplace(newValue);
          } else {
            element.value = newValue;
            element.setSelectionRange(start, start);
          }

          // Clear stored selection after cut
          setSelectionRange(null);
        } catch (err) {
          console.error("Failed to cut:", err);
        }
      }
    }
    // Note: Cut doesn't make sense for non-editable content
  };

  const handleCopy = async () => {
    if (selectedText) {
      try {
        await navigator.clipboard.writeText(selectedText);
        // Don't clear selection for copy - we want to keep it
      } catch (err) {
        console.error("Failed to copy:", err);
      }
    }
  };

  const handlePaste = async () => {
    if (!selectionRange || !isEditable) return;

    if (selectionRange.type === "editable") {
      const element = selectionRange.element;
      if (
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLInputElement
      ) {
        try {
          // Modern Clipboard API
          const text = await navigator.clipboard.readText();
          const { start, end } = selectionRange;
          const before = element.value.substring(0, start);
          const after = element.value.substring(end);
          const newValue = before + text + after;

          if (onTextReplace) {
            // Use callback if provided
            onTextReplace(newValue);
          } else {
            // Fallback: direct update
            element.value = newValue;
            element.setSelectionRange(start + text.length, start + text.length);
          }
        } catch (err) {
          console.error("Failed to paste:", err);
        }
      }
    }
  };

  const handleSelectAll = () => {
    if (!selectionRange) return;

    // Clear the stored selection so handleMenuClose doesn't restore the old one
    const selectionToUse = selectionRange;
    setSelectionRange(null);

    if (selectionToUse.type === "editable") {
      // EDITABLE PATH: Use element.select()
      const element = selectionToUse.element;
      if (
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLInputElement
      ) {
        // Use requestAnimationFrame for better timing
        requestAnimationFrame(() => {
          element.focus();
          element.select();
        });
      }
    } else {
      // NON-EDITABLE PATH: Create Range for container content only
      const container = selectionToUse.containerElement;
      if (container) {
        requestAnimationFrame(() => {
          try {
            const range = document.createRange();
            range.selectNodeContents(container);

            const selection = window.getSelection();
            if (selection) {
              selection.removeAllRanges();
              selection.addRange(range);
            }
          } catch (error) {
            console.error("[UnifiedContextMenu] Select all failed:", error);
          }
        });
      }
    }
  };

  const handleFind = () => {
    // Prevent selection restoration when opening Find modal
    setSkipSelectionRestore(true);
    setFindReplaceOpen(true);
    findReplaceOpenRef.current = true; // Set ref immediately for reliable access
  };

  // Handle shortcut execution via unified Redux system
  const handleShortcutTrigger = async (
    shortcut: any,
    placementType: string,
  ) => {
    try {
      // Check if builtin is connected
      if (!shortcut.prompt_builtin) {
        toast({
          title: "Prompt Not Connected",
          description: (
            <div className="flex flex-col gap-2">
              <p className="font-medium">{shortcut.label}</p>
              <p className="text-sm text-muted-foreground">
                This shortcut has no connected prompt builtin. Please configure
                it in the admin panel.
              </p>
            </div>
          ),
          variant: "destructive",
        });
        return;
      }

      const builtin = shortcut.prompt_builtin;

      // Build application scopes (standard + custom)
      // Use captured selection if available (Mac fix), otherwise use state
      const selectionText =
        capturedSelection.current?.text || selectedText || "";
      const applicationScope = {
        selection: selectionText,
        content: contextData?.content || "",
        context: contextData?.context || "",
      };

      // Map application scopes to prompt variables using scope_mappings
      const variables = mapScopeToVariables(
        applicationScope,
        shortcut.scope_mappings || {},
        builtin.variableDefaults || [],
      );

      if (isDebugMode) {
        dispatch(
          showPromptDebugIndicator({
            promptName: shortcut.label,
            placementType,
            selectedText: selectionText,
            availableContext: applicationScope,
            resolvedVariables: variables,
            canResolve: {
              canResolve: true,
              missingVariables: [],
              resolvedVariables: Object.keys(variables),
            },
            metadata: {
              scopeMappings: shortcut.scope_mappings,
              availableScopes: shortcut.available_scopes,
            },
          }),
        );
      }

      // Fire-and-forget agent shortcut launch. The agx_shortcut row carries
      // display mode, auto_run, allow_chat, scopeMappings, etc. — we hand it
      // the live UI scope and let the launcher manage everything downstream.
      //
      // 1:1 ID note: `shortcut.id` here is a `prompt_shortcuts.id` from the
      // legacy `context_menu_unified_view`. It works as an agent-shortcut id
      // because the prompts→agents migration preserved IDs across the two
      // tables. See the TODO at the `useShortcutTrigger()` call site.
      await trigger(shortcut.id, {
        scope: applicationScope as unknown as ApplicationScope,
        sourceFeature: "context-menu",
      });
    } catch (error) {
      console.error("[UnifiedContextMenu] Error executing shortcut:", error);
      const errorMessage =
        error instanceof Error ? error.message : extractErrorMessage(error);

      toast({
        title: "Execution Failed",
        description: (
          <div className="flex flex-col gap-2">
            <p className="font-medium">{shortcut.label}</p>
            <p className="text-sm text-muted-foreground">{errorMessage}</p>
            {isDebugMode && (
              <pre className="mt-2 text-xs bg-muted p-2 rounded overflow-x-auto">
                {error instanceof Error
                  ? (error.stack ?? error.message)
                  : extractErrorMessage(error)}
              </pre>
            )}
          </div>
        ),
        variant: "destructive",
      });
    }
  };

  // Handle content block "Render Block Template" insertion
  const handleContentBlockInsert = (block: ContentBlockItem) => {
    const template = block.template;

    if (editorId) {
      // Use editor insertion
      const {
        insertTextAtCursor,
      } = require("@/features/rich-text-editor/utils/insertTextUtils");
      const success = insertTextAtCursor(editorId, template);
      if (success) onContentInserted?.();
    } else if (getTextarea) {
      // Use textarea insertion
      const {
        insertTextAtTextareaCursor,
      } = require("@/features/prompts/utils/textareaInsertUtils");
      const textarea = getTextarea();
      if (textarea) {
        const success = insertTextAtTextareaCursor(textarea, template);
        if (success) onContentInserted?.();
      }
    }
  };

  // Handle menu item selection (handles BOTH shortcuts and content blocks!)
  const handleMenuItemSelect = (item: MenuItem, placementType: string) => {
    if (item.type === "prompt_shortcut") {
      // Convert to the format expected by handleShortcutTrigger
      const shortcutData = {
        ...item,
        prompt_builtin: item.prompt_builtin,
        is_active: true,
      };
      handleShortcutTrigger(shortcutData as any, placementType);
    } else if (item.type === "content_block") {
      handleContentBlockInsert(item);
    }
  };

  // Get icon for placement type
  const getPlacementIcon = (placementType: string) => {
    const icons: Record<string, any> = {
      [PLACEMENT_TYPES.AI_ACTION]: Lightbulb,
      [PLACEMENT_TYPES.CONTENT_BLOCK]: FileText,
      [PLACEMENT_TYPES.ORGANIZATION_TOOL]: Building,
      [PLACEMENT_TYPES.USER_TOOL]: User,
      "quick-action": Zap,
    };
    return icons[placementType] || FileText;
  };

  // Group category groups by placement type
  const groupedByPlacement = React.useMemo(() => {
    const groups: Record<string, typeof categoryGroups> = {};

    categoryGroups.forEach((group) => {
      const placementType = group.category.placement_type;
      if (!groups[placementType]) {
        groups[placementType] = [];
      }
      groups[placementType].push(group);
    });

    return groups;
  }, [categoryGroups]);

  // Check if a placement type should be shown
  const shouldShowPlacement = (placementType: string) => {
    return enabledPlacements.includes(placementType);
  };

  // Shared menu content renderer - works for both ContextMenu and DropdownMenu
  const renderMenuContent = (MenuComponents: {
    Item: typeof ContextMenuItem | typeof DropdownMenuItem;
    Separator: typeof ContextMenuSeparator | typeof DropdownMenuSeparator;
    Sub: typeof ContextMenuSub | typeof DropdownMenuSub;
    SubTrigger: typeof ContextMenuSubTrigger | typeof DropdownMenuSubTrigger;
    SubContent: typeof ContextMenuSubContent | typeof DropdownMenuSubContent;
    Label: typeof ContextMenuLabel | typeof DropdownMenuLabel;
  }) => {
    const {
      Item: MenuItem,
      Separator,
      Sub,
      SubTrigger,
      SubContent,
      Label,
    } = MenuComponents;

    // Recursive function to render category hierarchy
    const renderCategoryGroupInternal = (
      group: (typeof categoryGroups)[0],
      placementType: string,
    ) => {
      const { category, items, children } = group;
      const hasContent = items.length > 0 || (children && children.length > 0);

      return (
        <React.Fragment key={category.id}>
          <Sub>
            <SubTrigger
              className={!hasContent ? "opacity-50 cursor-not-allowed" : ""}
            >
              <IconResolver
                iconName={category.icon_name}
                className="h-4 w-4 mr-2"
                style={{ color: category.color || "currentColor" }}
                fallbackIcon="FileText"
              />
              {category.label}
            </SubTrigger>
            <SubContent className="w-64">
              {!hasContent && (
                <div className="px-2 py-6 text-center">
                  <p className="text-sm text-muted-foreground">
                    No items in {category.label}
                  </p>
                </div>
              )}

              {items.map((item) => {
                const isDisabled =
                  item.type === "prompt_shortcut" &&
                  (!item.prompt_builtin || !item.prompt_builtin_id);

                return (
                  <MenuItem
                    key={item.id}
                    onSelect={() => handleMenuItemSelect(item, placementType)}
                    disabled={isDisabled}
                  >
                    {item.type === "content_block" ? (
                      <item.icon className="h-4 w-4 mr-2" />
                    ) : (
                      <IconResolver
                        iconName={item.icon_name}
                        className="h-4 w-4 mr-2"
                        fallbackIcon="FileText"
                      />
                    )}
                    {item.label}
                    {isDisabled && (
                      <span className="ml-auto text-xs text-muted-foreground">
                        Not configured
                      </span>
                    )}
                  </MenuItem>
                );
              })}

              {children && children.length > 0 && (
                <>
                  {items.length > 0 && <Separator />}
                  {children.map((childGroup) =>
                    renderCategoryGroupInternal(childGroup, placementType),
                  )}
                </>
              )}
            </SubContent>
          </Sub>
        </React.Fragment>
      );
    };

    return (
      <>
        {loading && (
          <Label className="text-xs text-muted-foreground">Loading...</Label>
        )}

        {/* Selection Indicator */}
        {selectedText && (
          <>
            <div className="px-2 py-2 border-b border-border bg-primary/5">
              <div className="flex items-start gap-2">
                <Type className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-primary mb-0.5">
                    Selected ({selectedText.length} char
                    {selectedText.length !== 1 ? "s" : ""})
                  </div>
                  <div className="text-xs text-muted-foreground font-mono break-all leading-tight">
                    {selectedText.length <= 50
                      ? `"${selectedText}"`
                      : `"${selectedText.substring(0, 20)}...${selectedText.substring(selectedText.length - 20)}"`}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Undo / Redo */}
        {(onUndo || onRedo) && (
          <>
            {onUndo && (
              <MenuItem onSelect={onUndo} disabled={!canUndo}>
                <Undo2 className="h-4 w-4 mr-2" />
                Undo
                {undoHint && (
                  <span className="ml-auto text-xs text-muted-foreground">
                    {undoHint}
                  </span>
                )}
              </MenuItem>
            )}
            {onRedo && (
              <MenuItem onSelect={onRedo} disabled={!canRedo}>
                <Redo2 className="h-4 w-4 mr-2" />
                Redo
                {redoHint && (
                  <span className="ml-auto text-xs text-muted-foreground">
                    {redoHint}
                  </span>
                )}
              </MenuItem>
            )}
            {onViewHistory && (
              <MenuItem onSelect={onViewHistory} disabled={!hasHistory}>
                <History className="h-4 w-4 mr-2" />
                View History
              </MenuItem>
            )}
            <Separator />
          </>
        )}

        {/* Browser Actions */}
        <MenuItem onSelect={handleCopy} disabled={!selectedText}>
          <Copy className="h-4 w-4 mr-2" />
          Copy
        </MenuItem>
        <MenuItem onSelect={handleCut} disabled={!selectedText || !isEditable}>
          <Scissors className="h-4 w-4 mr-2" />
          Cut
        </MenuItem>
        <MenuItem onSelect={handlePaste} disabled={!isEditable}>
          <Clipboard className="h-4 w-4 mr-2" />
          Paste
        </MenuItem>
        <MenuItem onSelect={handleSelectAll}>
          <Type className="h-4 w-4 mr-2" />
          Select All
        </MenuItem>
        <MenuItem onSelect={handleFind}>
          <Search className="h-4 w-4 mr-2" />
          Find...
        </MenuItem>
        <Separator />

        {/* Placement type sections */}
        {enabledPlacements
          .filter((p) => p !== "quick-action")
          .map((placementType) => {
            const groups = groupedByPlacement[placementType] || [];
            const hasItemsRecursive = (group: (typeof groups)[0]): boolean => {
              if (group.items.length > 0) return true;
              if (group.children && group.children.length > 0) {
                return group.children.some((child) => hasItemsRecursive(child));
              }
              return false;
            };
            const hasItems =
              groups.length > 0 && groups.some((g) => hasItemsRecursive(g));
            const PlacementIcon = getPlacementIcon(placementType);
            const placementMeta =
              PLACEMENT_TYPE_META[
                placementType as keyof typeof PLACEMENT_TYPE_META
              ];
            const label = placementMeta?.label || placementType;

            return (
              <React.Fragment key={placementType}>
                <Sub>
                  <SubTrigger
                    disabled={!hasItems}
                    className={!hasItems ? "opacity-50 cursor-not-allowed" : ""}
                  >
                    <PlacementIcon className="h-4 w-4 mr-2" />
                    {label}
                  </SubTrigger>
                  <SubContent className="w-64">
                    {groups.length === 0 || !hasItems ? (
                      <div className="px-2 py-6 text-center">
                        <p className="text-sm text-muted-foreground">
                          No {label}
                        </p>
                      </div>
                    ) : (
                      <>
                        {groups.map((group) =>
                          renderCategoryGroupInternal(group, placementType),
                        )}
                      </>
                    )}
                  </SubContent>
                </Sub>
              </React.Fragment>
            );
          })}

        {/* Quick Actions */}
        {shouldShowPlacement("quick-action") && (
          <>
            <Sub>
              <SubTrigger>
                <Zap className="h-4 w-4 mr-2" />
                Quick Actions
              </SubTrigger>
              <SubContent className="w-56">
                <MenuItem onSelect={() => openQuickNotes()}>
                  <StickyNote className="h-4 w-4 mr-2" />
                  <div className="flex flex-col">
                    <span>Notes</span>
                    <span className="text-xs text-muted-foreground">
                      Quick capture
                    </span>
                  </div>
                </MenuItem>
                <MenuItem onSelect={() => openQuickTasks()}>
                  <CheckSquare className="h-4 w-4 mr-2" />
                  <div className="flex flex-col">
                    <span>Tasks</span>
                    <span className="text-xs text-muted-foreground">
                      Manage tasks
                    </span>
                  </div>
                </MenuItem>
                <MenuItem onSelect={() => openQuickChat()}>
                  <MessageSquare className="h-4 w-4 mr-2" />
                  <div className="flex flex-col">
                    <span>Chat</span>
                    <span className="text-xs text-muted-foreground">
                      AI assistant
                    </span>
                  </div>
                </MenuItem>
                <MenuItem onSelect={() => openQuickData()}>
                  <Database className="h-4 w-4 mr-2" />
                  <div className="flex flex-col">
                    <span>Data</span>
                    <span className="text-xs text-muted-foreground">
                      View tables
                    </span>
                  </div>
                </MenuItem>
                <MenuItem onSelect={() => openQuickFiles()}>
                  <FolderOpen className="h-4 w-4 mr-2" />
                  <div className="flex flex-col">
                    <span>Files</span>
                    <span className="text-xs text-muted-foreground">
                      Browse files
                    </span>
                  </div>
                </MenuItem>
                <MenuItem onSelect={() => openVoicePad()}>
                  <Mic className="h-4 w-4 mr-2" />
                  <div className="flex flex-col">
                    <span>Voice Input</span>
                    <span className="text-xs text-muted-foreground">
                      Record &amp; transcribe
                    </span>
                  </div>
                </MenuItem>
              </SubContent>
            </Sub>
          </>
        )}

        {/* Admin Section */}
        {isAdmin && (
          <>
            <Separator />
            <Sub>
              <SubTrigger>
                <Shield className="h-4 w-4 mr-2" />
                Admin Tools
              </SubTrigger>
              <SubContent className="w-56">
                <MenuItem onSelect={() => dispatch(toggleDebugMode())}>
                  {isDebugMode ? (
                    <EyeOff className="h-4 w-4 mr-2 text-amber-600 dark:text-amber-400" />
                  ) : (
                    <Eye className="h-4 w-4 mr-2" />
                  )}
                  <div className="flex flex-col">
                    <span>{isDebugMode ? "Disable" : "Enable"} Debug Mode</span>
                    <span className="text-xs text-muted-foreground">
                      {isDebugMode ? "Hide debug info" : "Show debug info"}
                    </span>
                  </div>
                </MenuItem>
                {isDebugMode && (
                  <MenuItem
                    onSelect={() => setContextDebugOpen(true)}
                    className="text-amber-600 dark:text-amber-400"
                  >
                    <Bug className="h-4 w-4 mr-2" />
                    <div className="flex flex-col">
                      <span>Inspect Context</span>
                      <span className="text-xs text-muted-foreground">
                        View available data
                      </span>
                    </div>
                  </MenuItem>
                )}
                <Separator />
                <MenuItem
                  onSelect={() =>
                    dispatch(toggleOverlay({ overlayId: "adminIndicator" }))
                  }
                >
                  {isAdminIndicatorOpen ? (
                    <Eye className="h-4 w-4 mr-2 text-green-600 dark:text-green-400" />
                  ) : (
                    <EyeOff className="h-4 w-4 mr-2" />
                  )}
                  <div className="flex flex-col">
                    <span>
                      {isAdminIndicatorOpen ? "Hide" : "Show"} Admin Indicator
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {isAdminIndicatorOpen ? "Hide overlay" : "Show overlay"}
                    </span>
                  </div>
                </MenuItem>
              </SubContent>
            </Sub>
          </>
        )}
      </>
    );
  };

  // Floating selection icon component (returns null if should not show, otherwise returns the button element)
  const renderFloatingSelectionIcon = () => {
    // Keep the button visible if dropdown is open (even if showFloatingIcon is false)
    // This prevents the menu from losing its anchor
    const shouldRender = (showFloatingIcon || dropdownOpen) && selectionRect;

    if (!shouldRender) return null;

    // Additional validation: ensure rect has valid dimensions
    // Note: We allow small dimensions (like our fake rect) as long as they're not zero
    if (selectionRect.width <= 0 || selectionRect.height <= 0) {
      if (isDebugMode) {
        console.log(
          "[UnifiedContextMenu] FloatingSelectionIcon: Invalid rect dimensions, not rendering",
          {
            width: selectionRect.width,
            height: selectionRect.height,
          },
        );
      }
      return null;
    }

    // Detect mobile/touch device
    const isMobile =
      typeof window !== "undefined" &&
      ("ontouchstart" in window ||
        navigator.maxTouchPoints > 0 ||
        window.innerWidth < 768);

    // Calculate position: centered above selection
    // Larger touch target on mobile (48x48 vs 40x40)
    const iconWidth = isMobile ? 48 : 40;
    const iconHeight = isMobile ? 48 : 40;
    const offsetAbove = isMobile ? 12 : 8; // More space on mobile

    // Since we're using 'fixed' positioning, selectionRect is already viewport-relative
    // Don't add scroll offsets - getBoundingClientRect() returns viewport coordinates
    const centerX = selectionRect.left + selectionRect.width / 2;
    const left = centerX - iconWidth / 2;
    const top = selectionRect.top - iconHeight - offsetAbove;

    // Check if there's space above, otherwise position below
    const shouldPositionBelow = top < 10;
    const finalTop = shouldPositionBelow
      ? selectionRect.bottom + offsetAbove
      : top;

    // Ensure icon stays within viewport horizontally
    const viewportWidth = window.innerWidth;
    const horizontalPadding = isMobile ? 16 : 10;
    const finalLeft = Math.max(
      horizontalPadding,
      Math.min(left, viewportWidth - iconWidth - horizontalPadding),
    );

    if (isDebugMode) {
      console.log("[UnifiedContextMenu] FloatingSelectionIcon position:", {
        selectionRect: {
          top: selectionRect.top,
          left: selectionRect.left,
          width: selectionRect.width,
          height: selectionRect.height,
          bottom: selectionRect.bottom,
        },
        calculated: {
          centerX,
          left,
          top,
          shouldPositionBelow,
          finalTop,
          finalLeft,
        },
        viewport: {
          width: viewportWidth,
          scrollX: window.scrollX,
          scrollY: window.scrollY,
        },
      });
    }

    const handleOpen = (
      e: React.MouseEvent | React.TouchEvent | React.KeyboardEvent,
    ) => {
      e.preventDefault();
      e.stopPropagation();
      // Lock selection before opening dropdown
      selectionLocked.current = true;
      setDropdownOpen(true);
    };

    return (
      <button
        onClick={handleOpen}
        onTouchEnd={(e) => {
          // Handle touch events for mobile
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
          touchAction: "manipulation", // Prevent double-tap zoom on mobile
        }}
        aria-label="Open text actions menu"
        role="button"
        tabIndex={dropdownOpen ? -1 : 0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            handleOpen(e);
          }
          if (e.key === "Escape") {
            setShowFloatingIcon(false);
          }
        }}
      >
        <Lightbulb className={isMobile ? "h-6 w-6" : "h-5 w-5"} />
      </button>
    );
  };

  // Handle dropdown close
  const handleDropdownClose = (open: boolean) => {
    setDropdownOpen(open);
    if (!open) {
      // Unlock selection when dropdown closes
      selectionLocked.current = false;
      capturedSelection.current = null;
      // Hide floating icon after dropdown closes
      setTimeout(() => {
        setShowFloatingIcon(false);
        setSelectionRect(null);
      }, 100);
    }
  };

  // Recursive function to render category hierarchy (kept for backwards compatibility, but now uses renderMenuContent)
  const renderCategoryGroup = (
    group: (typeof categoryGroups)[0],
    placementType: string,
  ) => {
    const { category, items, children } = group;

    // Show category even if empty (user wants this!)
    const hasContent = items.length > 0 || (children && children.length > 0);

    return (
      <React.Fragment key={category.id}>
        <ContextMenuSub>
          <ContextMenuSubTrigger
            className={!hasContent ? "opacity-50 cursor-not-allowed" : ""}
          >
            <IconResolver
              iconName={category.icon_name}
              className="h-4 w-4 mr-2"
              style={{ color: category.color || "currentColor" }}
              fallbackIcon="FileText"
            />
            {category.label}
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-64">
            {/* Show message if empty */}
            {!hasContent && (
              <div className="px-2 py-6 text-center">
                <p className="text-sm text-muted-foreground">
                  No items in {category.label}
                </p>
              </div>
            )}

            {/* Render items in this category */}
            {items.map((item) => {
              // Check if disabled (only for shortcuts)
              const isDisabled =
                item.type === "prompt_shortcut" &&
                (!item.prompt_builtin || !item.prompt_builtin_id);

              return (
                <ContextMenuItem
                  key={item.id}
                  onSelect={() => handleMenuItemSelect(item, placementType)}
                  disabled={isDisabled}
                >
                  {item.type === "content_block" ? (
                    <item.icon className="h-4 w-4 mr-2" />
                  ) : (
                    <IconResolver
                      iconName={item.icon_name}
                      className="h-4 w-4 mr-2"
                      fallbackIcon="FileText"
                    />
                  )}
                  {item.label}
                  {isDisabled && (
                    <span className="ml-auto text-xs text-muted-foreground">
                      Not configured
                    </span>
                  )}
                </ContextMenuItem>
              );
            })}

            {/* Recursively render child categories */}
            {children && children.length > 0 && (
              <>
                {items.length > 0 && <ContextMenuSeparator />}
                {children.map((childGroup) =>
                  renderCategoryGroup(childGroup, placementType),
                )}
              </>
            )}
          </ContextMenuSubContent>
        </ContextMenuSub>
      </React.Fragment>
    );
  };

  return (
    <>
      <ContextMenu onOpenChange={(open) => !open && handleMenuClose()}>
        <ContextMenuTrigger
          asChild
          onMouseDown={handleMouseDown}
          onContextMenu={handleContextMenu}
        >
          {children}
        </ContextMenuTrigger>

        <ContextMenuContent className={`w-64 ${className}`}>
          {renderMenuContent({
            Item: ContextMenuItem,
            Separator: ContextMenuSeparator,
            Sub: ContextMenuSub,
            SubTrigger: ContextMenuSubTrigger,
            SubContent: ContextMenuSubContent,
            Label: ContextMenuLabel,
          })}
        </ContextMenuContent>
      </ContextMenu>

      {/* Floating Selection Icon and Dropdown Menu */}
      {enableFloatingIcon && (
        <DropdownMenu open={dropdownOpen} onOpenChange={handleDropdownClose}>
          <DropdownMenuTrigger asChild>
            {renderFloatingSelectionIcon() || (
              <div style={{ display: "none" }} />
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-64"
            align="center"
            side="bottom"
            sideOffset={5}
          >
            {renderMenuContent({
              Item: DropdownMenuItem,
              Separator: DropdownMenuSeparator,
              Sub: DropdownMenuSub,
              SubTrigger: DropdownMenuSubTrigger,
              SubContent: DropdownMenuSubContent,
              Label: DropdownMenuLabel,
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Context Debug Modal */}
      {isDebugMode && (
        <ContextDebugModal
          isOpen={contextDebugOpen}
          onClose={() => setContextDebugOpen(false)}
          contextData={{
            selection: capturedSelection.current?.text || selectedText,
            content: contextData?.content || "",
            context: contextData?.context || "",
            ...contextData, // Include all custom variables
          }}
        />
      )}

      {/* Text Result Modal */}
      {textResultModalOpen && textResultData && (
        <TextActionResultModal
          isOpen={textResultModalOpen}
          onClose={() => {
            setTextResultModalOpen(false);
            setTextResultData(null);
            setSelectionRange(null);
            setSelectedText("");
          }}
          originalText={textResultData.original}
          aiResponse={textResultData.result}
          promptName={textResultData.promptName}
          onReplace={(newText) => {
            onTextReplace?.(newText);
            setSelectionRange(null);
            setSelectedText("");
            setTextResultModalOpen(false);
          }}
          onInsertBefore={(text) => {
            onTextInsertBefore?.(text);
            setSelectionRange(null);
            setSelectedText("");
            setTextResultModalOpen(false);
          }}
          onInsertAfter={(text) => {
            onTextInsertAfter?.(text);
            setSelectionRange(null);
            setSelectedText("");
            setTextResultModalOpen(false);
          }}
        />
      )}

      {/* Find/Replace Modal */}
      <FindReplaceModal
        isOpen={findReplaceOpen}
        onClose={() => {
          setFindReplaceOpen(false);
          findReplaceOpenRef.current = false;
        }}
        targetElement={
          selectionRange?.element as
            | HTMLTextAreaElement
            | HTMLInputElement
            | null
        }
        onReplace={onTextReplace}
      />
    </>
  );
}
