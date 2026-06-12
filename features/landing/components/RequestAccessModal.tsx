'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Check, AlertCircle, Loader2, Lightbulb, Phone, Brain, Radio } from 'lucide-react';
import { submitInvitationRequestStep1, submitInvitationRequestStep2 } from '../actions';
import { InvitationRequestStep1, InvitationRequestStep2, USER_TYPE_OPTIONS } from '../types';

interface RequestAccessModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RequestAccessModal({ open, onOpenChange }: RequestAccessModalProps) {
  const router = useRouter();
  const [step, setStep] = useState<'form' | 'followup'>('form');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);

  // Step 1 form data
  const [step1Data, setStep1Data] = useState<InvitationRequestStep1>({
    full_name: '',
    company: '',
    email: '',
    use_case: '',
    user_type: 'business_executive',
    user_type_other: '',
  });

  // Step 2 form data
  const [step2Data, setStep2Data] = useState<InvitationRequestStep2>({
    phone: '',
    biggest_obstacle: '',
    referral_source: '',
    current_ai_systems: '',
    recent_project: '',
  });

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      // Silently submit the request in the background
      const result = await submitInvitationRequestStep1(step1Data);

      if (!result.success) {
        setError('error' in result ? result.error : 'Failed to submit request');
        setIsSubmitting(false);
        return;
      }

      // Save the request ID and move to optional follow-up
      setRequestId(result.data.requestId);
      setStep('followup');
      setIsSubmitting(false);
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
      setIsSubmitting(false);
    }
  };

  const handleFollowupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    if (!requestId) {
      setError('Invalid request. Please start over.');
      setIsSubmitting(false);
      return;
    }

    try {
      const result = await submitInvitationRequestStep2(requestId, step2Data);

      if (!result.success) {
        setError('error' in result ? result.error : 'Failed to submit additional information');
        setIsSubmitting(false);
        return;
      }

      // Redirect to the dedicated success page
      setIsSubmitting(false);
      onOpenChange(false);
      router.push('/request-access/thank-you');
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
      setIsSubmitting(false);
    }
  };

  const handleSkipFollowup = () => {
    onOpenChange(false);
    router.push('/request-access/thank-you');
  };

  const handleClose = () => {
    // Reset form
    setStep('form');
    setStep1Data({
      full_name: '',
      company: '',
      email: '',
      use_case: '',
      user_type: 'business_executive',
      user_type_other: '',
    });
    setStep2Data({
      phone: '',
      biggest_obstacle: '',
      referral_source: '',
      current_ai_systems: '',
      recent_project: '',
    });
    setError(null);
    setRequestId(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`border-zinc-200 dark:border-zinc-800 max-h-[90dvh] overflow-y-auto p-0 gap-0 ${
          step === 'followup'
            ? 'sm:max-w-2xl overflow-hidden'
            : 'sm:max-w-2xl'
        }`}
      >
        {step === 'followup' ? (
          <>
            {/* ── Hero section ── */}
            <div className="relative overflow-hidden rounded-t-xl">
              {/* Gradient background */}
              <div
                className="absolute inset-0"
                style={{
                  background:
                    'linear-gradient(135deg, hsl(var(--primary)/0.18) 0%, hsl(262 80% 60%/0.12) 50%, hsl(var(--primary)/0.06) 100%)',
                }}
              />
              {/* Decorative orbs */}
              <div className="absolute -top-8 -right-8 w-48 h-48 rounded-full" style={{ background: 'radial-gradient(circle, hsl(var(--primary)/0.25) 0%, transparent 70%)' }} />
              <div className="absolute -bottom-6 -left-6 w-32 h-32 rounded-full" style={{ background: 'radial-gradient(circle, hsl(262 80% 60%/0.2) 0%, transparent 70%)' }} />

              <div className="relative px-6 pt-8 pb-6 pr-14">
                {/* Success pill */}
                <div className="inline-flex items-center gap-2 rounded-full bg-green-500/15 border border-green-500/25 px-3 py-1 mb-4">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-xs font-semibold text-green-600 dark:text-green-400 tracking-wide uppercase">Request Submitted</span>
                </div>

                <div className="flex items-start gap-4">
                  {/* Brand icon */}
                  <div
                    className="shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg"
                    style={{ background: 'linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(262 80% 55%) 100%)' }}
                  >
                    <Lightbulb className="w-7 h-7 text-white" />
                  </div>

                  <div>
                    <DialogTitle className="text-xl sm:text-2xl font-bold text-foreground leading-tight mb-1">
                      One more thing&hellip;
                    </DialogTitle>
                    <DialogDescription className="text-sm text-muted-foreground leading-relaxed max-w-sm">
                      All optional &mdash; help us tailor your experience and move you to the front of the queue.
                    </DialogDescription>
                  </div>
                </div>

                {/* Confirmation note */}
                <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground/80">
                  <svg className="w-3.5 h-3.5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                  </svg>
                  Confirmation email sent &bull; We&apos;ll review within 1&ndash;2 business days
                </div>
              </div>
            </div>

            {/* Divider */}
            <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />
          </>
        ) : (
          <div className="px-6 pt-6">
            <DialogHeader>
              <DialogTitle className="text-2xl font-semibold">Request Early Access</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Join the future of enterprise AI. Share a few details to request your invitation.
              </DialogDescription>
            </DialogHeader>
          </div>
        )}

        {step === 'form' ? (
          <div className="px-6 pb-6">
          <form onSubmit={handleFormSubmit} className="space-y-4 mt-4">
            {/* Full Name */}
            <div className="space-y-2">
              <Label htmlFor="full_name" className="text-sm font-medium">
                Full Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="full_name"
                type="text"
                value={step1Data.full_name}
                onChange={(e) => setStep1Data({ ...step1Data, full_name: e.target.value })}
                placeholder="John Smith"
                required
                disabled={isSubmitting}
                className="text-base"
                style={{ fontSize: '16px' }}
              />
            </div>

            {/* Company */}
            <div className="space-y-2">
              <Label htmlFor="company" className="text-sm font-medium">
                Company/Organization <span className="text-destructive">*</span>
              </Label>
              <Input
                id="company"
                type="text"
                value={step1Data.company}
                onChange={(e) => setStep1Data({ ...step1Data, company: e.target.value })}
                placeholder="Acme Corporation"
                required
                disabled={isSubmitting}
                className="text-base"
                style={{ fontSize: '16px' }}
              />
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">
                Email <span className="text-destructive">*</span>
              </Label>
              <Input
                id="email"
                type="email"
                value={step1Data.email}
                onChange={(e) => setStep1Data({ ...step1Data, email: e.target.value })}
                placeholder="john@acme.com"
                required
                disabled={isSubmitting}
                className="text-base"
                style={{ fontSize: '16px' }}
              />
            </div>

            {/* User Type */}
            <div className="space-y-2">
              <Label htmlFor="user_type" className="text-sm font-medium">
                What best describes you? <span className="text-destructive">*</span>
              </Label>
              <Select
                value={step1Data.user_type}
                onValueChange={(value) =>
                  setStep1Data({ ...step1Data, user_type: value as any, user_type_other: '' })
                }
                disabled={isSubmitting}
              >
                <SelectTrigger id="user_type" className="text-base" style={{ fontSize: '16px' }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {USER_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Other Specification */}
            {step1Data.user_type === 'other' && (
              <div className="space-y-2">
                <Label htmlFor="user_type_other" className="text-sm font-medium">
                  Please specify <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="user_type_other"
                  type="text"
                  value={step1Data.user_type_other}
                  onChange={(e) => setStep1Data({ ...step1Data, user_type_other: e.target.value })}
                  placeholder="Your role"
                  required={step1Data.user_type === 'other'}
                  disabled={isSubmitting}
                  className="text-base"
                  style={{ fontSize: '16px' }}
                />
              </div>
            )}

            {/* Use Case */}
            <div className="space-y-2">
              <Label htmlFor="use_case" className="text-sm font-medium">
                What will you build or accomplish with this system? <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="use_case"
                value={step1Data.use_case}
                onChange={(e) => setStep1Data({ ...step1Data, use_case: e.target.value })}
                placeholder="Describe what you want to achieve..."
                required
                disabled={isSubmitting}
                rows={3}
                className="resize-none text-base"
                style={{ fontSize: '16px' }}
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-lg">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting} className="flex-1 bg-primary hover:bg-primary/90">
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    Submit Request
                  </>
                )}
              </Button>
            </div>
          </form>
          </div>
        ) : (
          <div className="px-6 pb-6">
          <form onSubmit={handleFollowupSubmit} className="space-y-4 mt-5">
            {/* Phone + Referral row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone" className="text-sm font-medium">
                  Phone <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  value={step2Data.phone}
                  onChange={(e) => setStep2Data({ ...step2Data, phone: e.target.value })}
                  placeholder="+1 (555) 123-4567"
                  disabled={isSubmitting}
                  className="text-base"
                  style={{ fontSize: '16px' }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="referral_source" className="text-sm font-medium">
                  How did you hear about us?
                </Label>
                <Input
                  id="referral_source"
                  type="text"
                  value={step2Data.referral_source}
                  onChange={(e) => setStep2Data({ ...step2Data, referral_source: e.target.value })}
                  placeholder="LinkedIn, Twitter, colleague…"
                  disabled={isSubmitting}
                  className="text-base"
                  style={{ fontSize: '16px' }}
                />
              </div>
            </div>

            {/* Biggest Obstacle + Current AI Systems row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="biggest_obstacle" className="text-sm font-medium">
                  Biggest AI obstacle?
                </Label>
                <Textarea
                  id="biggest_obstacle"
                  value={step2Data.biggest_obstacle}
                  onChange={(e) => setStep2Data({ ...step2Data, biggest_obstacle: e.target.value })}
                  placeholder="Tell us the challenges you're facing…"
                  disabled={isSubmitting}
                  rows={2}
                  className="resize-none text-base h-24"
                  style={{ fontSize: '16px' }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="current_ai_systems" className="text-sm font-medium">
                  Current AI tools you use?
                </Label>
                <Textarea
                  id="current_ai_systems"
                  value={step2Data.current_ai_systems}
                  onChange={(e) => setStep2Data({ ...step2Data, current_ai_systems: e.target.value })}
                  placeholder="ChatGPT, Cursor, Midjourney…"
                  disabled={isSubmitting}
                  rows={2}
                  className="resize-none text-base h-24"
                  style={{ fontSize: '16px' }}
                />
              </div>
            </div>

            {/* Recent Project */}
            <div className="space-y-2">
              <Label htmlFor="recent_project" className="text-sm font-medium">
                Tell us about a recent AI project or experiment
              </Label>
              <Textarea
                id="recent_project"
                value={step2Data.recent_project}
                onChange={(e) => setStep2Data({ ...step2Data, recent_project: e.target.value })}
                placeholder="Share your experience..."
                disabled={isSubmitting}
                rows={3}
                className="resize-none text-base"
                style={{ fontSize: '16px' }}
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-lg">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleSkipFollowup}
                disabled={isSubmitting}
                className="flex-1"
              >
                Skip for now
              </Button>
              <Button type="submit" disabled={isSubmitting} className="flex-1 bg-primary hover:bg-primary/90">
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    Complete Profile
                  </>
                )}
              </Button>
            </div>
          </form>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

