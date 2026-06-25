// Editable Task Title Component
"use client";

import React, { useState, useRef, useEffect } from "react";
import { Check, X, Edit2, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface EditableTaskTitleProps {
  title: string;
  completed: boolean;
  onSave: (newTitle: string) => Promise<void>;
  onToggleComplete: () => void;
}

export default function EditableTaskTitle({
  title,
  completed,
  onSave,
  onToggleComplete,
}: EditableTaskTitleProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState(title);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = async () => {
    const trimmedTitle = editedTitle.trim();

    if (!trimmedTitle) {
      setEditedTitle(title); // Reset to original
      setIsEditing(false);
      return;
    }

    if (trimmedTitle === title) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    try {
      await onSave(trimmedTitle);
      setIsEditing(false);
    } catch (error) {
      console.error("Failed to save title:", error);
      setEditedTitle(title); // Reset on error
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setEditedTitle(title);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleCancel();
    }
  };

  if (isEditing) {
    return (
      <div className="flex items-center gap-2 flex-1">
        <Input
          ref={inputRef}
          type="text"
          value={editedTitle}
          onChange={(e) => setEditedTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isSaving}
          className="flex-1"
          placeholder="Task title..."
        />
        <Button
          size="sm"
          onClick={handleSave}
          disabled={isSaving || !editedTitle.trim()}
          className="h-8 w-8 p-0"
        >
          {isSaving ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Check size={16} />
          )}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={handleCancel}
          disabled={isSaving}
          className="h-8 w-8 p-0"
        >
          <X size={16} />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-1 group">
      <span
        className={`flex-1 ${
          completed ? "line-through text-muted-foreground" : "text-foreground"
        }`}
      >
        {title}
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsEditing(true);
        }}
        className="p-1 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-primary rounded hover:bg-accent"
        title="Edit title"
      >
        <Edit2 size={14} />
      </button>
    </div>
  );
}
