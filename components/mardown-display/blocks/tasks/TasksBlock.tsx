"use client";
import React, { useMemo, useState } from "react";
import { CheckSquare, ListPlus, ExternalLink } from "lucide-react";
import TaskChecklist from "@/components/mardown-display/blocks/tasks/TaskChecklist";
import { parseMarkdownChecklist } from "@/components/mardown-display/blocks/tasks/tasklist-parser";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import ChatCollapsibleWrapper from "@/components/mardown-display/blocks/ChatCollapsibleWrapper";
import TaskPreviewWindow from "@/features/tasks/components/TaskPreviewWindow";
import TaskChipRow from "@/features/tasks/widgets/TaskChipRow";

interface TasksBlockProps {
  content: string;
  /** Server message id — threaded via BlockRenderer. Enables provenance + chip row. */
  messageId?: string;
  /** Server conversation id — for future linkage */
  conversationId?: string;
  /** Chat block index within the message, if available */
  blockIndex?: number;
}

const TasksBlock: React.FC<TasksBlockProps> = ({
  content,
  messageId,
  blockIndex,
}) => {
  const [checkboxState, setCheckboxState] = useState({});
  const [previewOpen, setPreviewOpen] = useState(false);
  const { toast } = useToast();

  const parsedItems = useMemo(() => parseMarkdownChecklist(content), [content]);

  const handleSaveState = (state: Record<string, boolean>) => {
    setCheckboxState(state);
    toast({
      title: "Tasks saved",
      description: "Your task progress has been saved successfully",
    });
  };

  return (
    <ChatCollapsibleWrapper
      icon={<CheckSquare className="h-4 w-4 text-primary" />}
      title="Tasks"
      controls={null}
    >
      <TaskChecklist
        content={content}
        initialState={checkboxState}
        onStateChange={setCheckboxState}
        onSave={handleSaveState}
        hideTitle={true}
      />

      {/* Existing task links from this message */}
      {messageId && (
        <div className="mt-2 pt-2 border-t border-border/30">
          <TaskChipRow
            entityType="chat_block"
            entityId={messageId}
            label={`Tasks from block #${blockIndex ?? 0}`}
            size="xs"
            hideIfEmpty={false}
          />
        </div>
      )}

      <TaskPreviewWindow
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        parsedItems={parsedItems}
        source={
          messageId
            ? {
                entity_type: "chat_block",
                entity_id: messageId,
                metadata: { block_index: blockIndex ?? 0 },
              }
            : undefined
        }
        onCreated={(ids) => {
          toast({
            title: `Created ${ids.length} task${ids.length !== 1 ? "s" : ""}`,
            description: "Open /tasks to view or edit.",
          });
        }}
      />
    </ChatCollapsibleWrapper>
  );
};

export default TasksBlock;
