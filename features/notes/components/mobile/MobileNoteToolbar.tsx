'use client';

import React, { useState } from 'react';
import { FolderOpen, FolderPlus, Tag as TagIcon, X, Plus } from 'lucide-react';
import { useNotesRedux } from '../../hooks/useNotesRedux';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useAllFolders } from '@/features/notes/utils/folderUtils';
import { CreateFolderDialog } from '../CreateFolderDialog';
import { createFolder } from '../../service/notesService';

interface MobileNoteToolbarProps {
  folder: string;
  tags: string[];
  onFolderChange: (folder: string) => void;
  onTagsChange: (tags: string[]) => void;
  onClose: () => void;
}

export default function MobileNoteToolbar({
  folder,
  tags,
  onFolderChange,
  onTagsChange,
  onClose,
}: MobileNoteToolbarProps) {
  const { notes } = useNotesRedux();
  const [newTag, setNewTag] = useState('');
  const [showFolders, setShowFolders] = useState(true);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);

  const availableFolders = useAllFolders(notes);

  // Create a folder (note_folders record) then move THIS note into it — same
  // data model the desktop sidebar uses; the folder then shows in the list.
  const handleCreateFolder = (name: string) => {
    void (async () => {
      try {
        await createFolder(name);
      } catch {
        /* fall through — assigning the note still surfaces the folder */
      }
      onFolderChange(name);
      onClose();
    })();
  };

  const handleAddTag = () => {
    const trimmedTag = newTag.trim();
    if (trimmedTag && !tags.includes(trimmedTag)) {
      onTagsChange([...tags, trimmedTag]);
      setNewTag('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    onTagsChange(tags.filter(t => t !== tagToRemove));
  };

  return (
    <div className="h-full flex flex-col">
      {/* Tabs */}
      <div className="flex-shrink-0 flex border-b border-border">
        <button
          onClick={() => setShowFolders(true)}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            showFolders
              ? 'text-primary border-b-2 border-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <FolderOpen size={16} />
            Folder
          </div>
        </button>
        <button
          onClick={() => setShowFolders(false)}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            !showFolders
              ? 'text-primary border-b-2 border-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <TagIcon size={16} />
            Tags
          </div>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {showFolders ? (
          /* Folders View */
          <div className="space-y-2">
            <button
              onClick={() => setCreateFolderOpen(true)}
              className="w-full flex items-center gap-3 p-3 rounded-lg border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors"
            >
              <FolderPlus size={18} />
              <span className="flex-1 text-left font-medium">New folder…</span>
            </button>
            {availableFolders.map((folderName) => (
              <button
                key={folderName}
                onClick={() => {
                  onFolderChange(folderName);
                  onClose();
                }}
                className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                  folder === folderName
                    ? 'bg-primary/10 border-primary/30'
                    : 'bg-card border-border hover:border-border/80'
                }`}
              >
                <FolderOpen
                  size={18}
                  className={folder === folderName ? 'text-primary' : 'text-muted-foreground'}
                />
                <span className="flex-1 text-left font-medium">{folderName}</span>
                {folder === folderName && (
                  <div className="w-2 h-2 bg-primary rounded-full" />
                )}
              </button>
            ))}
          </div>
        ) : (
          /* Tags View */
          <div className="space-y-4">
            {/* Current Tags */}
            {tags.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-foreground mb-2">Current Tags</h3>
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className="flex items-center gap-1 pr-1 text-sm"
                    >
                      {tag}
                      <button
                        onClick={() => handleRemoveTag(tag)}
                        className="ml-1 hover:text-destructive transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Add Tag */}
            <div>
              <h3 className="text-sm font-medium text-foreground mb-2">Add Tag</h3>
              <div className="flex items-center gap-2">
                <Input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  placeholder="Enter tag name..."
                  onKeyPress={(e) => e.key === 'Enter' && handleAddTag()}
                  className="flex-1"
                />
                <Button
                  size="icon"
                  onClick={handleAddTag}
                  disabled={!newTag.trim() || tags.includes(newTag.trim())}
                  className="flex-shrink-0"
                >
                  <Plus size={18} />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 border-t border-border p-4">
        <Button onClick={onClose} className="w-full" size="lg">
          Done
        </Button>
      </div>

      <CreateFolderDialog
        open={createFolderOpen}
        onOpenChange={setCreateFolderOpen}
        existingFolders={availableFolders}
        onConfirm={handleCreateFolder}
      />
    </div>
  );
}

