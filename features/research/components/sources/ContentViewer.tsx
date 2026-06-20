"use client";

import { useState, useCallback } from "react";
import { Pencil, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProTextarea } from "@/components/official/ProTextarea";
import { Badge } from "@/components/ui/badge";
import { useResearchApi } from "../../hooks/useResearchApi";
import type { ResearchContent } from "../../types";

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
  const api = useResearchApi();
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [saving, setSaving] = useState(false);

  const startEdit = useCallback(() => {
    setEditText(content.content);
    setEditing(true);
  }, [content.content]);

  const cancelEdit = useCallback(() => {
    setEditing(false);
    setEditText("");
  }, []);

  const saveEdit = useCallback(async () => {
    setSaving(true);
    try {
      await api.editContent(topicId, content.id, { content: editText });
      setEditing(false);
      onSaved();
    } finally {
      setSaving(false);
    }
  }, [api, topicId, content.id, editText, onSaved]);

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
        </div>
      )}
    </div>
  );
}
