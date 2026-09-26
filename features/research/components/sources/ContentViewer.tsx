"use client";

import { useState, useCallback } from "react";
import { Pencil, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProTextarea } from "@/components/official/ProTextarea";
import { Badge } from "@/components/ui/badge";
import { saveResearchContentEdit, updateContentCurated } from "../../service";
import { runResearchAction } from "../../utils/researchAction";
import { toast } from "@/lib/toast";
import type { ResearchContent } from "../../types";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

interface ContentViewerProps {
  topicId: string;
  content: ResearchContent;
  onSaved: () => void;
}

export function ContentViewer({
  topicId,
  content,
  onSaved,
}: ContentViewerProps) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [saving, setSaving] = useState(false);

  const startEdit = useCallback(() => {
    setEditText(content.content ?? "");
    setEditing(true);
  }, [content.content]);

  const cancelEdit = useCallback(() => {
    setEditing(false);
    setEditText("");
  }, []);

  // A page that is a Source is edited THROUGH the Source (a version beside
  // the original, restorable); a page not yet a Source through research's
  // edit route. A refusal keeps the editor open with the text and says the
  // server's own sentence.
  const saveEdit = useCallback(async () => {
    setSaving(true);
    try {
      const saved = await runResearchAction("Couldn't save your edit", async () => {
        if (content.processed_document_id) {
          const landed = await updateContentCurated(content, editText);
          toast.success(
            landed?.notices?.[0]?.message ??
              "Your edit was saved to the Source; the original capture is kept.",
          );
        } else {
          await saveResearchContentEdit(topicId, content.id, editText);
          toast.success("Saved as a new version of this page.");
        }
        return true;
      });
      if (!saved) return;
      setEditing(false);
      onSaved();
    } finally {
      setSaving(false);
    }
  }, [topicId, content, editText, onSaved]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Content</h3>
          <Badge variant="secondary" className="text-[10px]">
            v{content.version}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {content.char_count?.toLocaleString()} chars
          </Badge>
          {content.is_good_scrape && (
            <Badge className="text-[10px] bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
              Good
            </Badge>
          )}
          {content.capture_method && (
            <Badge variant="outline" className="text-[10px]">
              {content.capture_method}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          {!editing ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={startEdit}
              className="gap-1.5"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={cancelEdit}>
                <X className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                onClick={saveEdit}
                disabled={saving}
                className="gap-1.5"
              >
                <Save className="h-3.5 w-3.5" />
                Save
              </Button>
            </>
          )}
        </div>
      </div>

      {editing ? (
        <ProTextarea
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          autoGrow
          minHeight={400}
          maxHeight={600}
          enableTextStats
          className="font-mono text-xs"
          wrapperClassName="w-full"
        />
      ) : (
        <div className="rounded-lg border border-border bg-muted/30 p-4 max-h-[500px] overflow-y-auto">
          <pre className="whitespace-pre-wrap text-xs font-mono leading-relaxed text-foreground">
            {content.content}
          </pre>
        </div>
      )}

      {content.failure_reason && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
          <span className="font-medium">Failure reason: </span>
          {content.failure_reason}
          <ErrorAlchemyMenu error={content.failure_reason} />
        </div>
      )}
    </div>
  );
}
