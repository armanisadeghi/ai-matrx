"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ProTextarea } from "@/components/official/ProTextarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { useResearchApi } from "../../hooks/useResearchApi";

interface PasteContentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  topicId: string;
  sourceId: string;
  onSaved: () => void;
}

export function PasteContentModal({
  open,
  onOpenChange,
  topicId,
  sourceId,
  onSaved,
}: PasteContentModalProps) {
  const api = useResearchApi();
  const isMobile = useIsMobile();
  const [content, setContent] = useState("");
  const [contentType, setContentType] = useState("plain_text");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!content.trim()) return;
    setSaving(true);
    try {
      await api.pasteContent(topicId, sourceId, {
        content,
        content_type: contentType,
      });
      setContent("");
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const formContent = (
    <div className="space-y-4 p-4">
      <Select value={contentType} onValueChange={setContentType}>
        <SelectTrigger className="text-base" style={{ fontSize: "16px" }}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="plain_text">Plain Text</SelectItem>
          <SelectItem value="html">HTML</SelectItem>
          <SelectItem value="markdown">Markdown</SelectItem>
        </SelectContent>
      </Select>
      <ProTextarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Paste content here..."
        autoGrow
        minHeight={200}
        maxHeight={400}
        className="text-base"
        wrapperClassName="w-full"
      />
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={!content.trim() || saving}>
          Save Content
        </Button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[85dvh]">
          <DrawerTitle className="px-4 pt-4 text-base font-semibold">
            Paste Content
          </DrawerTitle>
          <div className="overflow-y-auto overscroll-contain pb-safe">
            {formContent}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Paste Content</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto">{formContent}</div>
      </DialogContent>
    </Dialog>
  );
}
