/**
 * Voice Troubleshooting Modal
 * 
 * Modal wrapper for voice diagnostics
 * Uses VoiceDiagnosticsDisplay core component
 */

'use client';

import React from 'react';
import { Mic } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { VoiceDiagnosticsDisplay } from './VoiceDiagnosticsDisplay';

export interface VoiceTroubleshootingModalProps {
  isOpen: boolean;
  onClose: () => void;
  error?: string | null;
  errorCode?: string | null;
}

export function VoiceTroubleshootingModal({
  isOpen,
  onClose,
  error,
  errorCode,
}: VoiceTroubleshootingModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Mic className="h-5 w-5" />
            Voice Input Troubleshooting
          </DialogTitle>
          <DialogDescription>
            Diagnose and fix microphone access issues
          </DialogDescription>
        </DialogHeader>

        <VoiceDiagnosticsDisplay
          error={error}
          errorCode={errorCode}
          autoRun={true}
        />
      </DialogContent>
    </Dialog>
  );
}

