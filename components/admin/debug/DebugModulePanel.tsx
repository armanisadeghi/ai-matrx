// components/admin/debug/DebugModulePanel.tsx
'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { getDebugModule, DebugModule } from './debugModuleRegistry';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

/**
 * DebugModulePanel
 * 
 * A modal panel that displays debug module content.
 * Uses React Portal to render outside the normal DOM hierarchy,
 * ensuring it appears above all other content.
 */

interface DebugModulePanelProps {
  moduleId: string | null;
  onClose: () => void;
}

export default function DebugModulePanel({ moduleId, onClose }: DebugModulePanelProps) {
  const [mounted, setMounted] = useState(false);
  
  // Ensure we're in the browser before using portals
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Close on Escape key
  useEffect(() => {
    if (!moduleId) return undefined;
    
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [moduleId, onClose]);

  if (!moduleId || !mounted) return null;

  const module = getDebugModule(moduleId);
  if (!module) return null;

  const DebugComponent = module.component;
  const Icon = module.icon;

  const panelContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <Card
        className="w-full max-w-4xl max-h-[90dvh] overflow-hidden bg-background shadow-2xl border-2"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-muted/50">
          <div className="flex items-center gap-3">
            <Icon className={`h-6 w-6 ${module.color || 'text-foreground'}`} />
            <div>
              <h2 className="text-xl font-semibold">{module.name} Debug</h2>
              <p className="text-sm text-muted-foreground">{module.description}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90dvh-100px)]">
          <DebugComponent />
        </div>
      </Card>
    </div>
  );

  // Use portal to render outside the admin indicator
  return createPortal(panelContent, document.body);
}

