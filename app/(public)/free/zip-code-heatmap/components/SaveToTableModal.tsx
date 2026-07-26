'use client';

import React, { useState } from 'react';
import { Save, Loader2, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { supabase } from '@/utils/supabase/client';
import { createTable, addRow } from '@/utils/user-table-utls/table-utils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ZipCodeData } from '../page';

interface SaveToTableModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: ZipCodeData[];
  onSuccess?: (tableId: string) => void;
}

export default function SaveToTableModal({
  isOpen,
  onClose,
  data,
  onSuccess,
}: SaveToTableModalProps) {
  const [tableName, setTableName] = useState('');
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!tableName.trim()) {
      setError('Please enter a table name');
      return;
    }

    if (data.length === 0) {
      setError('No data to save');
      return;
    }

    try {
      setIsSaving(true);
      setError(null);

      // Create the table with two fields: zip_code and count
      const createResult = await createTable(supabase, {
        tableName: tableName.trim(),
        description: description.trim() || `Zip code heatmap data - ${data.length} records`,
        isPublic: false,
        authenticatedRead: true,
        fields: [
          {
            field_name: 'zip_code',
            display_name: 'Zip Code',
            data_type: 'string',
            field_order: 1,
            is_required: true,
          },
          {
            field_name: 'count',
            display_name: 'Count',
            data_type: 'integer',
            field_order: 2,
            is_required: true,
          },
        ],
      });

      if (!createResult.success || !createResult.tableId) {
        throw new Error(createResult.error || 'Failed to create table');
      }

      const tableId = createResult.tableId;

      // Insert all rows
      for (const item of data) {
        const rowResult = await addRow(supabase, {
          tableId,
          data: {
            zip_code: item.zipCode,
            count: item.count,
          },
        });

        if (!rowResult.success) {
          console.warn(`Failed to add row for zip ${item.zipCode}:`, rowResult.error);
        }
      }

      // Call success callback
      if (onSuccess) {
        onSuccess(tableId);
      }

      // Close modal
      onClose();

      // Reset form
      setTableName('');
      setDescription('');
    } catch (err) {
      console.error('Error saving to table:', err);
      setError(err instanceof Error ? err.message : 'Failed to save data');
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open && !isSaving) {
      onClose();
      setError(null);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            Save to Table
          </DialogTitle>
          <DialogDescription>
            Create a new table with your zip code data. You can access it later from the /data
            route.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription className="text-sm">{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="tableName">
              Table Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="tableName"
              value={tableName}
              onChange={(e) => setTableName(e.target.value)}
              placeholder="e.g., CA_Zip_Codes_2024"
              disabled={isSaving}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description (Optional)</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description for your table"
              rows={3}
              disabled={isSaving}
            />
          </div>

          <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md">
            <p className="font-semibold mb-1">This will create:</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>A new table with {data.length} rows</li>
              <li>Two columns: Zip Code (string) and Count (integer)</li>
              <li>Private access (only you can view/edit)</li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving || !tableName.trim()}>
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Create Table
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

