import type { PathBookmark } from "@/features/scraper/utils/json-path-navigation-util";

export type PathSegment = [number, string]; // [rowIndex, selectedKey]
export type PathArray = PathSegment[];

export interface JSONNodeValue {
    value: any;
    type: string;
    name?: string;
}

// Unified with the canonical bookmark shape produced/consumed by
// features/scraper/utils/json-path-navigation-util.ts (createPathBookmark,
// saveBookmarks, loadBookmarks, exportBookmarks) — previously this was a
// separately hand-declared "compatible" shape that drifted (optional
// `description`, `segments[].value: string | number`) and caused type
// errors at every call site that round-trips bookmarks through that module.
export type Bookmark = PathBookmark;

export interface BookmarkDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    currentPath: PathArray;
    bookmarkName: string;
    setBookmarkName: (name: string) => void;
    bookmarkDescription: string;
    setBookmarkDescription: (desc: string) => void;
    onSave: () => void;
}

export interface BookmarksDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    bookmarks: Bookmark[];
    onJumpToBookmark: (bookmark: Bookmark) => void;
    onDeleteBookmark: (index: number) => void;
}

export interface NavigationRowsProps {
  originalData: any;
  currentPath: PathArray;
  onKeySelect: (rowIndex: number, key: string) => void;
  onContextMenu?: (e: React.MouseEvent, path: PathArray) => void;
  hiddenPaths?: string[];
  isPathHidden?: (path: PathArray) => boolean;
}

export interface ActionButtonsProps {
  bookmarks: Bookmark[];
  jsonStr: string;
  currentPath: PathArray;
  onExportBookmarks: () => void;
  onOpenBookmarksDialog: () => void;
  onOpenBookmarkDialog: () => void;
  onCopyPath: () => void;
  onReset: () => void;
  onOpenCopyPathObjectDialog?: () => void;
  ignorePrefix?: string;
  onIgnorePrefixChange?: (prefix: string) => void;
} 