'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface InfoEditTabProps {
  id: string;
  onUpdate: (field: string, value: string) => void;
}

export default function InfoEditTab({ id, onUpdate }: InfoEditTabProps) {
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="space-y-4">
          <p className="text-gray-700 dark:text-gray-300">
            This tab will contain additional information and settings for the applet.
          </p>
          
          <div>
            <Label htmlFor="applet-notes">Notes</Label>
            <Textarea 
              id="applet-notes" 
              placeholder="Add notes about this applet"
              rows={6}
              onChange={(e) => onUpdate('notes', e.target.value)}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              These notes are for internal use only and won't be displayed to users.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
} 