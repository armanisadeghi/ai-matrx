"use client";
import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { generateAccessPath, parseAccessPathToArray } from "./json-utils";
import { PathArray } from "./types";
import { copyToClipboard } from "@/features/scraper/utils/scraper-utils";

function buildEnhancedBookmarkObject(
  currentPath: PathArray,
  name: string,
  ignorePrefix?: string,
) {
  try {
    const fullPathArray = parseAccessPathToArray(generateAccessPath(currentPath));

    if (ignorePrefix) {
      try {
        const prefixArray = parseAccessPathToArray(ignorePrefix);

        if (
          Array.isArray(prefixArray) &&
          prefixArray.length > 0 &&
          prefixArray.length <= fullPathArray.length
        ) {
          let matches = true;
          for (let i = 0; i < prefixArray.length; i++) {
            if (prefixArray[i] !== "*" && fullPathArray[i] !== prefixArray[i]) {
              matches = false;
              break;
            }
          }

          if (matches) {
            return { name, path: fullPathArray.slice(prefixArray.length) };
          }
        }
      } catch (parseError) {
        console.warn("Failed to parse ignorePrefix:", ignorePrefix, parseError);
      }
    }

    return { name, path: fullPathArray };
  } catch (error) {
    console.error("Error building enhanced bookmark object:", error);
    return { name, path: [] };
  }
}

export interface CopyPathObjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPath: PathArray;
  ignorePrefix?: string;
}

const CopyPathObjectDialog: React.FC<CopyPathObjectDialogProps> = ({
  open,
  onOpenChange,
  currentPath,
  ignorePrefix = undefined
}) => {
  const [name, setName] = useState("");

  const handleCopy = () => {
    if (!name.trim()) return;
    
    const enhancedBookmark = buildEnhancedBookmarkObject(currentPath, name.trim(), ignorePrefix);
    const jsonString = JSON.stringify(enhancedBookmark, null, 2);
    
    copyToClipboard(jsonString);
    onOpenChange(false);
    setName("");
  };

  const handleClose = () => {
    onOpenChange(false);
    setName("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Copy Path Object</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="path-name">Object Name</Label>
            <Input
              id="path-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter a name for this path object"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && name.trim()) {
                  handleCopy();
                }
              }}
            />
          </div>
          <div className="space-y-2">
            <Label>Preview:</Label>
            <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-md">
              <pre className="text-xs text-gray-800 dark:text-gray-300">
                {JSON.stringify(buildEnhancedBookmarkObject(currentPath, name.trim() || "", ignorePrefix), null, 2)}
              </pre>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleCopy} disabled={!name.trim()}>
            Copy to Clipboard
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CopyPathObjectDialog; 