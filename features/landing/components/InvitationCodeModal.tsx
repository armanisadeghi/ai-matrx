'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@ai-matrx/design-system';
import { Label } from '@/components/ui/label';
import { Check, AlertCircle, Loader2 } from 'lucide-react';
import { validateInvitationCode } from '../actions';
import { cn } from '@/lib/utils';

interface InvitationCodeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InvitationCodeModal({ open, onOpenChange }: InvitationCodeModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  const formatCode = (value: string) => {
    // Remove all non-alphanumeric characters
    const cleaned = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    // Add hyphens every 4 characters
    const formatted = cleaned.match(/.{1,4}/g)?.join('-') || cleaned;
    return formatted.slice(0, 14); // XXXX-XXXX-XXXX max length
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCode(e.target.value);
    setCode(formatted);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!code || code.replace(/-/g, '').length < 12) {
      setError('Please enter a valid invitation code');
      return;
    }

    setIsValidating(true);

    try {
      const result = await validateInvitationCode(code);

      if (!result.success) {
        setError('error' in result ? result.error : 'Failed to validate code');
        setIsValidating(false);
        return;
      }

      if (!result.data.valid) {
        setError('Invalid or expired invitation code');
        setIsValidating(false);
        return;
      }

      // Code is valid, redirect to signup with the code
      startTransition(() => {
        router.push(`/sign-up?invitation=${encodeURIComponent(code)}`);
      });
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
      setIsValidating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-background border-zinc-200 dark:border-zinc-800">
        <DialogHeader>
          <DialogTitle className="text-2xl font-semibold">Enter Invitation Code</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Enter your exclusive invitation code to create your account
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-4">
          <div className="space-y-2">
            <Label htmlFor="invitation-code" className="text-sm font-medium">
              Invitation Code
            </Label>
            <Input
              id="invitation-code"
              type="text"
              value={code}
              onChange={handleCodeChange}
              placeholder="XXXX-XXXX-XXXX"
              className={cn(
                'text-center text-lg font-mono tracking-wider',
                error && 'border-destructive focus-visible:ring-destructive'
              )}
              disabled={isValidating || isPending}
              autoComplete="off"
              spellCheck={false}
            />
            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                <span>{error}</span>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <Button
              type="submit"
              size="lg"
              disabled={isValidating || isPending || !code}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {isValidating || isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Validating...
                </>
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Continue to Sign Up
                </>
              )}
            </Button>

            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isValidating || isPending}
              className="w-full"
            >
              Cancel
            </Button>
          </div>
        </form>

        <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800">
          <p className="text-xs text-center text-muted-foreground">
            Don't have an invitation code?{' '}
            <button
              type="button"
              onClick={() => {
                onOpenChange(false);
                // Small delay to allow modal to close before opening the next one
                setTimeout(() => {
                  const requestBtn = document.querySelector('[data-request-access]');
                  if (requestBtn instanceof HTMLElement) {
                    requestBtn.click();
                  }
                }, 150);
              }}
              className="text-primary hover:underline font-medium"
            >
              Request access
            </button>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

