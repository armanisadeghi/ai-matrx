"use client";
import React from "react";
import { Button } from "@/components/ui/ButtonMine";
import { Input } from "@/components/ui/input";
import { CopyIcon, RefreshCw, BookmarkIcon, Brackets } from "lucide-react";
import { IoBookmarks } from "react-icons/io5";
import { ActionButtonsProps } from "./types";
import { generateAccessPath } from "./json-utils";
import BookmarkManagerActions from "@/features/scraper/parts/BookmarkManagerActions";
import { copyToClipboard } from "@/features/scraper/utils/scraper-utils";

const ActionButtons: React.FC<ActionButtonsProps> = ({
  bookmarks,
  jsonStr,
  currentPath,
  onExportBookmarks,
  onOpenBookmarksDialog,
  onOpenBookmarkDialog,
  onCopyPath,
  onReset,
  onOpenCopyPathObjectDialog,
  ignorePrefix,
  onIgnorePrefixChange,
}) => {
  return (
    <div className="flex items-center">
      {onIgnorePrefixChange && (
        <Input
          value={ignorePrefix || ""}
          onChange={(e) => onIgnorePrefixChange(e.target.value)}
          placeholder="Ignore prefix..."
          className="h-6 w-32 text-xs"
          title="Path prefix to ignore when copying path objects"
        />
      )}
      {onOpenCopyPathObjectDialog && (
        <Button
          size="xs"
          variant="outline"
          onClick={onOpenCopyPathObjectDialog}
          title="Copy Path Object"
        >
          <Brackets className="w-3 h-3" />
          Path Object
        </Button>
      )}

      <BookmarkManagerActions jsonStr={jsonStr} />

      <Button
        size="xs"
        variant="outline"
        onClick={onOpenBookmarksDialog}
        title="View Saved Paths"
      >
        <IoBookmarks className="w-3 h-3" />
        Paths
      </Button>

      {bookmarks.length > 0 && (
        <Button
          size="sm"
          variant="outline"
          onClick={onExportBookmarks}
          title="Export All Bookmarks"
        >
          Export
        </Button>
      )}

      {generateAccessPath(currentPath) !== "data" && (
        <>
          <Button
            size="xs"
            variant="outline"
            onClick={onOpenBookmarkDialog}
            title="Save Current Path"
          >
            <BookmarkIcon className="w-3 h-3" />
            Save
          </Button>

          <Button
            size="xs"
            variant="outline"
            onClick={onCopyPath}
            title="Copy Access Path"
          >
            Path
          </Button>
        </>
      )}

      <Button size="xs" variant="outline" onClick={onReset} title="Reset">
        <RefreshCw className="w-3 h-3" />
      </Button>

      <Button
        size="xs"
        variant="outline"
        onClick={() => copyToClipboard(jsonStr)}
        title="Copy JSON"
      >
        <CopyIcon className="w-3 h-3" />
      </Button>
    </div>
  );
};

export default ActionButtons;
