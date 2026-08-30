"use client";
import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import { BookmarkDialogProps } from "./types";
import { generateAccessPath } from "./json-utils";

const BookmarkDialog: React.FC<BookmarkDialogProps> = ({
  open,
  onOpenChange,
  currentPath,
  bookmarkName,
  setBookmarkName,
  bookmarkDescription,
  setBookmarkDescription,
  onSave,
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save Current Path</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <label className="text-sm font-medium">Path:</label>
            <code className="text-xs block bg-gray-100 dark:bg-gray-800 p-2 rounded mt-1">
              {generateAccessPath(currentPath)}
            </code>
          </div>
          <div>
            <label htmlFor="bookmark-name" className="text-sm font-medium block mb-1">
              Name:
            </label>
            <Input
              id="bookmark-name"
              value={bookmarkName}
              onChange={(e) => setBookmarkName(e.target.value)}
              placeholder="Enter a name for this path"
            />
          </div>
          <div>
            <label htmlFor="bookmark-description" className="text-sm font-medium block mb-1">
              Description (optional):
            </label>
            <Input
              id="bookmark-description"
              value={bookmarkDescription}
              onChange={(e) => setBookmarkDescription(e.target.value)}
              placeholder="What does this path point to?"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BookmarkDialog; 