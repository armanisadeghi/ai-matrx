"use client";
import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { generateAccessPath, getPathAndTypeInfo } from "../utils/json-path-navigation-util";
import { BookmarkIcon, InfoIcon } from "lucide-react";
import { PathArray } from "../types";

export interface BookmarkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPath: PathArray;
  bookmarkName: string;
  setBookmarkName: (name: string) => void;
  bookmarkDescription: string;
  setBookmarkDescription: (desc: string) => void;
  onSave: () => void;
  originalData: unknown;
  configKey?: string;
}


const SaveBookmarkDialog: React.FC<BookmarkDialogProps> = ({
  open,
  onOpenChange,
  currentPath,
  bookmarkName,
  setBookmarkName,
  bookmarkDescription,
  setBookmarkDescription,
  onSave,
  originalData,
  configKey
}) => {
  // Generate the path string to display
  const pathString = generateAccessPath(currentPath);
  const pathTypeInfo = getPathAndTypeInfo(originalData, currentPath);
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="md:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Save Current Path</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {configKey && (
            <div className="bg-blue-50 dark:bg-blue-950 p-2 rounded text-xs flex items-start gap-2">
              <InfoIcon className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-blue-800 dark:text-blue-200 font-medium">Config: {configKey}</p>
                <p className="text-blue-700 dark:text-blue-300 mt-1">
                  This bookmark will be associated with this configuration context for better organization and filtering.
                </p>
              </div>
            </div>
          )}
          <div>
            <label className="text-sm font-medium">Path:</label>
            <div className="flex flex-col gap-2 mt-1">
              <code className="text-xs block bg-gray-100 dark:bg-gray-800 p-2 rounded overflow-x-auto whitespace-pre-wrap break-all">
                {pathString}
              </code>
              <div className="px-2 py-1 text-xs rounded bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 inline-block self-start">
                {pathTypeInfo?.readibleType || "Unknown Type"}
              </div>
            </div>
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
          <div className="bg-amber-50 dark:bg-amber-950 p-2 rounded text-xs flex items-start gap-2">
            <BookmarkIcon className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-amber-800 dark:text-amber-200">
              This bookmark will include additional type information that can be used for advanced filtering and navigation.
            </p>
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

export default SaveBookmarkDialog; 