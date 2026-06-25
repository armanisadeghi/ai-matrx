// Editable Project Name Component
"use client";

import React, { useState, useRef, useEffect } from "react";
import { Check, X, Edit2, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface EditableProjectNameProps {
  name: string;
  onSave: (newName: string) => Promise<void>;
}

export default function EditableProjectName({
  name,
  onSave,
}: EditableProjectNameProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(name);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = async () => {
    const trimmedName = editedName.trim();

    if (!trimmedName) {
      setEditedName(name);
      setIsEditing(false);
      return;
    }

    if (trimmedName === name) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    try {
      await onSave(trimmedName);
      setIsEditing(false);
    } catch (error) {
      console.error("Failed to save project name:", error);
      setEditedName(name);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setEditedName(name);
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
      <div
        className="flex items-center gap-1 w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <Input
          ref={inputRef}
          type="text"
          value={editedName}
          onChange={(e) => setEditedName(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isSaving}
          className="h-8 text-sm flex-1"
          placeholder="Project name..."
        />
        <Button
          size="sm"
          onClick={handleSave}
          disabled={isSaving || !editedName.trim()}
          className="h-8 w-8 p-0"
        >
          {isSaving ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Check size={14} />
          )}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={handleCancel}
          disabled={isSaving}
          className="h-8 w-8 p-0"
        >
          <X size={14} />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-1 group">
      <span className="truncate flex-1">{name}</span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsEditing(true);
        }}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-primary rounded hover:bg-accent"
        title="Edit project name"
      >
        <Edit2 size={12} />
      </button>
    </div>
  );
}
