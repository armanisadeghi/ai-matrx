'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Share2, Loader2, Copy, Check, Globe2, Lock, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@ai-matrx/design-system';
import { Label } from '@/components/ui/label';
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
import { useLoginHref } from '@/hooks/auth/useLoginHref';
import { ensureOrgId } from '@/lib/organizations/personalOrg';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ZipCodeData } from '../page';
import type { ColorScaleOptions } from './ColorScaleSelector';
import type { ViewMode } from './ViewModeSelector';
import { ProTextarea } from "@/components/official/ProTextarea";

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
  // `null` = we have not asked yet. The dialog never shows a Save button whose
  // outcome we cannot predict (DD-193): saving a heatmap is a signed-in action,
  // because `workbench.heatmap_saves` admits a row only through its `std_insert`
  // policy, which is `TO authenticated` and matches `created_by = auth.uid()`.
  const [isSignedIn, setIsSignedIn] = useState<boolean | null>(null);
  const loginHref = useLoginHref();

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    void supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setIsSignedIn(Boolean(data.user?.id));
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

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

      if (!user?.id) {
        // This used to try the insert anyway, for a signed-out visitor, and the
        // database refused it every time — the screen offered something it could
        // not do and then printed a raw Postgres sentence. It now says the true
        // thing, and the dialog itself offers the sign-in link (DD-193).
        setIsSignedIn(false);
        setError('Saving a heatmap needs an account, so the link stays yours. Sign in and your data and settings will still be here.');
        return;
      }

      // A signed-in user's save lives in their personal organization
      // (heatmap_saves.organization_id is NOT NULL).
      const organizationId = await ensureOrgId(undefined);

      // Insert heatmap save
      const { data: savedHeatmap, error: insertError } = await supabase
        .schema('workbench').from('heatmap_saves')
        .insert({
          user_id: user.id,
          organization_id: organizationId,
          title: title.trim(),
          description: description.trim() || null,
          data: data,
          view_settings: {
            viewMode: viewSettings.viewMode,
            scalingMethod: viewSettings.colorScaleOptions.scalingMethod,
            colorScheme: viewSettings.colorScaleOptions.colorScheme,
          },
          visibility: isPublic ? "public" : "personal",
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

              {isSignedIn === false && !error && (
                <Alert>
                  <LogIn className="w-4 h-4" />
                  <AlertDescription className="text-sm">
                    Saving a heatmap needs an account, so the link stays yours. Your data and
                    settings stay exactly as they are while you sign in.
                  </AlertDescription>
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
                <ProTextarea enableVoice={false} enableCleanup={false}
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
              {isSignedIn === false ? (
                <Button asChild>
                  <Link href={loginHref}>
                    <LogIn className="w-4 h-4 mr-2" />
                    Sign in to save
                  </Link>
                </Button>
              ) : (
                <Button onClick={handleSave} disabled={isSaving || isSignedIn === null || !title.trim()}>
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
              )}
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
                  <p className="flex items-start gap-2">
                    <Globe2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    <span>This link is <strong>public</strong>. Anyone with the link can view your
                    heatmap.
                    </span>
                  </p>
                ) : (
                  <p className="flex items-start gap-2">
                    <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    <span>This link is <strong>private</strong>. Only you can view it when logged in.
                    </span>
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
