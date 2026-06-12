// Task Details Component with Debounced Auto-Save
'use client';

import React, { useState, useEffect } from 'react';
import { Paperclip, X, Loader2, Maximize2, ExternalLink, Download } from 'lucide-react';
import { useAppDispatch } from '@/lib/redux/hooks';
import { updateTaskFieldThunk } from '@/features/tasks/redux/thunks';
import { useDebounce } from '../hooks/useDebounce';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FileUploadWithStorage } from '@/components/ui/file-upload/FileUploadWithStorage';

type AttachmentType = string | { name: string; url: string; size: number; type: string };

export default function TaskDetails({ task }: { task: any }) {
  const dispatch = useAppDispatch();

  // Local state for editing
  const [description, setDescription] = useState(task.description || '');
  const [dueDate, setDueDate] = useState(task.dueDate || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [showFileUpload, setShowFileUpload] = useState(false);
  const [attachments, setAttachments] = useState<AttachmentType[]>(task.attachments || []);

  // Debounce values - wait 1.5 seconds after user stops typing
  const debouncedDescription = useDebounce(description, 1500);
  const debouncedDueDate = useDebounce(dueDate, 1000);

  // Update local state when task prop changes
  useEffect(() => {
    setDescription(task.description || '');
    setDueDate(task.dueDate || '');
    setAttachments(task.attachments || []);
  }, [task.id]); // Only reset when task changes
  
  const handleFileUpload = (results: any[]) => {
    const newAttachments = results.map(r => ({
      name: r.file.name,
      url: r.url,
      size: r.file.size,
      type: r.file.type,
    }));
    
    // Add new attachments to existing ones
    const updatedAttachments = [...attachments, ...newAttachments];
    setAttachments(updatedAttachments);
    setShowFileUpload(false);
    
    // TODO: Update task in database with new attachments
    console.log('Uploaded files:', newAttachments);
  };
  
  const handleRemoveAttachment = (index: number) => {
    const newAttachments = attachments.filter((_, i) => i !== index);
    setAttachments(newAttachments);
    // TODO: Update task in database
  };
  
  const handleDownload = (url: string, name: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  useEffect(() => {
    if (debouncedDescription !== task.description) {
      setIsSaving(true);
      dispatch(
        updateTaskFieldThunk({
          taskId: task.id,
          patch: { description: debouncedDescription },
        }),
      ).finally(() => setIsSaving(false));
    }
  }, [debouncedDescription, task.id, task.description, dispatch]);

  useEffect(() => {
    if (debouncedDueDate !== task.dueDate) {
      setIsSaving(true);
      dispatch(
        updateTaskFieldThunk({
          taskId: task.id,
          patch: { due_date: debouncedDueDate || null },
        }),
      ).finally(() => setIsSaving(false));
    }
  }, [debouncedDueDate, task.id, task.dueDate, dispatch]);

  const detailsContent = (fullScreenMode = false) => (
    <div className={`space-y-3 ${!fullScreenMode ? 'mt-3 pl-6' : ''}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isSaving && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Loader2 size={12} className="animate-spin" />
              Saving...
            </span>
          )}
        </div>
        {!fullScreenMode && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsFullScreen(true);
            }}
            className="p-1 text-muted-foreground hover:text-primary rounded hover:bg-muted transition-colors"
            title="Expand to full screen"
          >
            <Maximize2 size={14} />
          </button>
        )}
      </div>
      
      <div>
        <label className="block text-xs font-medium text-foreground mb-1">
          Due Date
        </label>
        <Input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="text-sm"
        />
      </div>
      
      <div>
        <label className="block text-xs font-medium text-foreground mb-1">
          Details
        </label>
        <div className={`${fullScreenMode ? 'max-h-96' : 'max-h-48'} overflow-y-auto`}>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add details about this task..."
            className="text-sm resize-y"
            rows={fullScreenMode ? 12 : 8}
          />
        </div>
      </div>
      
      {/* Attachments */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-medium text-foreground">
            Attachments ({attachments.length})
          </h4>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowFileUpload(!showFileUpload);
            }}
            className="text-xs text-primary hover:underline flex items-center gap-1"
          >
            <Paperclip size={12} />
            Add Files
          </button>
        </div>
        
        {showFileUpload && (
          <div className="mb-3 p-3 border border-border rounded-lg bg-muted">
            <FileUploadWithStorage
              bucket="task-attachments"
              path={`tasks/${task.id}`}
              saveTo="private"
              onUploadComplete={handleFileUpload}
              useMiniUploader={true}
              multiple={true}
            />
          </div>
        )}
        
        {attachments.length > 0 ? (
          <ul className="space-y-1.5">
            {attachments.map((attachment: any, index: number) => (
              <li key={index} className="flex items-center gap-2 rounded px-2 py-1.5 bg-muted group">
                <Paperclip size={12} className="text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-foreground truncate">
                    {typeof attachment === 'string' ? attachment : attachment.name}
                  </div>
                  {attachment.size && (
                    <div className="text-xs text-muted-foreground">
                      {(attachment.size / 1024).toFixed(1)} KB
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {attachment.url && (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(attachment.url, '_blank');
                        }}
                        className="p-1 text-muted-foreground hover:text-primary rounded hover:bg-accent"
                        title="Open"
                      >
                        <ExternalLink size={12} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownload(attachment.url, attachment.name || 'download');
                        }}
                        className="p-1 text-muted-foreground hover:text-primary rounded hover:bg-accent"
                        title="Download"
                      >
                        <Download size={12} />
                      </button>
                    </>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveAttachment(index);
                    }}
                    className="p-1 text-muted-foreground hover:text-destructive rounded hover:bg-accent"
                    title="Remove"
                  >
                    <X size={12} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-4">
            No attachments yet. Click "Add Files" to upload.
          </p>
        )}
      </div>
    </div>
  );

  return (
    <>
      {detailsContent(false)}
      
      {/* Full Screen Modal */}
      <Dialog open={isFullScreen} onOpenChange={setIsFullScreen}>
        <DialogContent className="max-w-3xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className={task.completed ? 'line-through text-muted-foreground' : ''}>
                {task.title}
              </span>
            </DialogTitle>
          </DialogHeader>
          {detailsContent(true)}
        </DialogContent>
      </Dialog>
    </>
  );
}
