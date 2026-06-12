'use client';

import { Dialog, DialogContent } from '@/components/ui/dialog';
import { AICodeEditor, type AICodeEditorProps } from './AICodeEditor';

export type AICodeEditorModalProps = AICodeEditorProps;

/**
 * Modal wrapper for the AI Code Editor component.
 * This component wraps AICodeEditor with a Dialog for modal usage.
 * For standalone/embedded usage, use AICodeEditor directly.
 */
export function AICodeEditorModal({
  open,
  onOpenChange,
  ...editorProps
}: AICodeEditorModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl h-[95dvh] p-0 flex flex-col overflow-hidden gap-0">
        <AICodeEditor
          open={open}
          onOpenChange={onOpenChange}
          {...editorProps}
        />
      </DialogContent>
    </Dialog>
  );
}
