"use client";

import React, { useState } from "react";
import { ComponentEntry } from "../parts/component-list";
import { ComponentDisplayWrapper } from "../component-usage";
import { CategoryNotesModal } from "@/features/notes/actions/CategoryNotesModal";
import type { Note } from "@/features/notes/types";
import { Button } from "@/components/ui/button";
import { Database } from "lucide-react";

interface ComponentDisplayProps {
  component?: ComponentEntry;
}

export default function CategoryNotesModalDisplay({
  component,
}: ComponentDisplayProps) {
  if (!component) return null;

  const [isOpen, setIsOpen] = useState(false);

  // Example code with all available props and their default values
  const code = `import { CategoryNotesModal } from '@/features/notes/actions/CategoryNotesModal';
import type { Note } from '@/features/notes/types';
import { useState } from 'react';

const [isOpen, setIsOpen] = useState(false);

<CategoryNotesModal
  open={isOpen}                    // REQUIRED: Controls modal visibility
  onOpenChange={setIsOpen}         // REQUIRED: Callback when modal opens/closes
  categoryName="SQL Templates"     // REQUIRED: Category/folder to filter notes
  onSelectNote={(note: Note) => {  // Optional: Callback when a note is selected
    console.log('Selected:', note.content);
    setIsOpen(false);
  }}
  allowCreate={true}               // Allow creating new notes (default: true)
  allowEdit={true}                 // Allow editing notes (default: true)
  allowDelete={true}               // Allow deleting notes (default: true)
  selectButtonLabel="Use Template" // Label for select button (default: "Use")
  title="SQL Templates"            // Custom modal title (default: auto-generated)
  description="Manage SQL templates" // Custom description (default: auto-generated)
/>`;

  return (
    <ComponentDisplayWrapper
      component={component}
      code={code}
      description="Master-detail layout modal for managing category items. Left sidebar shows compact list, right area provides full-height editor. Features: Full CRUD, Import, minimal padding, small icons, mobile-responsive. Optimized for productivity like the notes app."
    >
      <div className="w-full max-w-2xl">
        <div className="p-6 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900">
          <h3 className="text-lg font-semibold mb-3 text-slate-900 dark:text-slate-100">
            Category Notes Modal Demo
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
            Master-detail layout with compact sidebar list and full-height
            editor. Desktop: Sidebar + Editor side-by-side. Mobile: Collapsible
            sidebar. Optimized for productivity with minimal padding and maximum
            content space.
          </p>

          <Button onClick={() => setIsOpen(true)} className="w-full">
            <Database className="h-4 w-4 mr-2" />
            Open SQL Templates
          </Button>

          <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200 dark:border-blue-800 space-y-2">
            <p className="text-xs text-blue-800 dark:text-blue-200">
              <strong>Master-Detail Layout:</strong> Compact sidebar list on
              left (320px), full-height editor on right. When creating/editing,
              the editor takes the entire available height for maximum
              productivity.
            </p>
            <p className="text-xs text-blue-800 dark:text-blue-200">
              <strong>Mobile-Responsive:</strong> Sidebar collapses on mobile
              with hamburger menu toggle. Small icons, minimal padding - focused
              on productivity and content, not wasted space.
            </p>
          </div>
        </div>

        <CategoryNotesModal
          open={isOpen}
          onOpenChange={setIsOpen}
          categoryName="SQL Templates"
          selectButtonLabel="Use Template"
          onSelectNote={(note: Note) => {
            console.log("Selected template:", note.label);
            setIsOpen(false);
          }}
          allowCreate={true}
          allowEdit={true}
          allowDelete={true}
        />
      </div>
    </ComponentDisplayWrapper>
  );
}
