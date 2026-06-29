'use client';

import React, { useState } from 'react';
import { Share2, Loader2, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { supabase } from '@/utils/supabase/client';
import { ensureOrgId } from '@/lib/organizations/personalOrg';
import { resolveSystemOrgId } from '@/lib/organizations/systemOrg';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ZipCodeData } from '../page';
import type { ColorScaleOptions } from './ColorScaleSelector';
import type { ViewMode } from './ViewModeSelector';

interface SaveHeatmapModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: ZipCodeData[];
  viewSettings: {
    viewMode: ViewMode;
    colorScaleOptions: ColorScaleOptions;
  };
}

export default function SaveHeatmapModal({
  isOpen,
  onClose,
  data,
  viewSettings,
}: SaveHeatmapModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) {
      setError('Please enter a title');
      return;
    }

    if (data.length === 0) {
      setError('No data to save');
      return;
    }

    try {
      setIsSaving(true);
      setError(null);

      // Get current user
      const {
        data: { user },
      } = await supabase.auth.getUser();

      // Public tool: a signed-in user's save lives in their org; an anonymous
      // save (no session) has no personal org, so it lands in the global system
      // org (heatmap_saves.organization_id is NOT NULL).
      const organizationId = user?.id
        ? await ensureOrgId(undefined)
        : await resolveSystemOrgId();

      // Insert heatmap save
      const { data: savedHeatmap, error: insertError } = await supabase
        .from('heatmap_saves')
        .insert({
          user_id: user?.id || null,
          organization_id: organizationId,
          title: title.trim(),
          description: description.trim() || null,
          data: data,
          view_settings: {
            viewMode: viewSettings.viewMode,
            scalingMethod: viewSettings.colorScaleOptions.scalingMethod,
            colorScheme: viewSettings.colorScaleOptions.colorScheme,
          },
          is_public: isPublic,
        })
        .select('id')
        .single();

      if (insertError) throw insertError;

      if (!savedHeatmap?.id) {
        throw new Error('Failed to save heatmap');
      }

      // Generate share URL
      const baseUrl = window.location.origin;
      const url = `${baseUrl}/free/zip-code-heatmap/${savedHeatmap.id}`;
      setShareUrl(url);
    } catch (err) {
      console.error('Error saving heatmap:', err);
      setError(err instanceof Error ? err.message : 'Failed to save heatmap');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyUrl = async () => {
    if (shareUrl) {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open && !isSaving) {
      onClose();
      setError(null);
      setShareUrl(null);
      setTitle('');
      setDescription('');
      setIsPublic(true);
      setCopied(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="w-5 h-5" />
            {shareUrl ? 'Heatmap Saved!' : 'Save & Share Heatmap'}
          </DialogTitle>
          <DialogDescription>
            {shareUrl
              ? 'Your heatmap has been saved. Share the link below.'
              : 'Save your heatmap configuration and get a shareable link.'}
          </DialogDescription>
        </DialogHeader>

        {!shareUrl ? (
          <>
            <div className="space-y-4 py-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription className="text-sm">{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="title">
                  Title <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., California Sales by Zip Code"
                  disabled={isSaving}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="desc">Description (Optional)</Label>
                <Textarea
                  id="desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional description for your heatmap"
                  rows={3}
                  disabled={isSaving}
                />
              </div>

              <div className="flex items-center justify-between space-x-2 p-3 border rounded-md">
                <div className="flex-1">
                  <Label htmlFor="public" className="text-sm font-medium">
                    Make Public
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Allow anyone with the link to view this heatmap
                  </p>
                </div>
                <Switch
                  id="public"
                  checked={isPublic}
                  onCheckedChange={setIsPublic}
                  disabled={isSaving}
                />
              </div>

              <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md">
                <p className="font-semibold mb-1">This will save:</p>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li>{data.length} zip code data points</li>
                  <li>Current view mode and color settings</li>
                  <li>A unique shareable link</li>
                </ul>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={isSaving}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={isSaving || !title.trim()}>
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Share2 className="w-4 h-4 mr-2" />
                    Save & Get Link
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="space-y-4 py-4">
              <Alert>
                <Check className="w-4 h-4" />
                <AlertDescription className="text-sm">
                  Your heatmap has been saved successfully!
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <Label>Share Link</Label>
                <div className="flex gap-2">
                  <Input value={shareUrl} readOnly className="font-mono text-sm" />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleCopyUrl}
                    className="flex-shrink-0"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md">
                {isPublic ? (
                  <p>
                    ✓ This link is <strong>public</strong>. Anyone with the link can view your
                    heatmap.
                  </p>
                ) : (
                  <p>
                    🔒 This link is <strong>private</strong>. Only you can view it when logged in.
                  </p>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button onClick={onClose} className="w-full">
                Done
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

