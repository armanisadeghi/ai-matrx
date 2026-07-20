// features/resource-manager/resource-picker/FilePickerSheet.tsx
//
// THE canonical "pick a stored file" overlay. Adaptive shell (right Sheet on
// desktop, bottom Drawer on mobile — project rule: never a Dialog on mobile)
// around the ONE canonical file browser, `FilesResourcePicker` (search,
// filters, recents, folder tree, thumbnails).
//
// Any surface that needs the user to choose stored files mounts THIS (or
// embeds `FilesResourcePicker` directly in an existing panel). Never build an
// ad-hoc file list: personal file enumeration is only allowed through the
// listing-gated data paths behind the canonical picker
// (`files.is_listable_for` — owner + explicit grants only).

"use client";

import { FolderOpen } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import {
  FilesResourcePicker,
  type FileSelection,
  type FilesResourcePickerFilter,
} from "./FilesResourcePicker";

export type { FileSelection };

export interface FilePickerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Header title. Defaults to "Choose a file". */
  title?: string;
  /** Header subtitle line. */
  description?: string;
  /**
   * Called for each picked file. The sheet stays open so the user can pick
   * several; return `"close"` to close it after a pick.
   */
  onPick: (selection: FileSelection) => void | "close" | Promise<void | "close">;
  initialFilter?: FilesResourcePickerFilter;
}

export function FilePickerSheet({
  open,
  onOpenChange,
  title = "Choose a file",
  description = "Pick from your stored files",
  onPick,
  initialFilter,
}: FilePickerSheetProps) {
  const isMobile = useIsMobile();

  const handleSelect = async (selection: FileSelection) => {
    const outcome = await onPick(selection);
    if (outcome === "close") onOpenChange(false);
  };

  const body = (
    <FilesResourcePicker
      onBack={() => onOpenChange(false)}
      onSelect={(selection) => void handleSelect(selection)}
      initialFilter={initialFilter}
    />
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[85dvh] flex flex-col pb-safe">
          <DrawerHeader className="text-left">
            <DrawerTitle className="flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-muted-foreground" />
              {title}
            </DrawerTitle>
            <DrawerDescription>{description}</DrawerDescription>
          </DrawerHeader>
          <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4">{body}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg flex flex-col gap-3"
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
            {title}
          </SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 min-h-0 overflow-y-auto">{body}</div>
      </SheetContent>
    </Sheet>
  );
}

export default FilePickerSheet;
