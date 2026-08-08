/**
 * Voice Diagnostics Display Component
 * 
 * Core diagnostic UI that can be used in modal or page contexts
 * Reusable component that avoids duplication
 */

'use client';

import React, { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle, XCircle, RefreshCw, Mic, Settings, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { runMicrophoneDiagnostics, getFixInstructions, canUserFixIssue, DiagnosticResult } from '../utils/microphone-diagnostics';
import { acquireMicStream, releaseMicStream } from '../micStream';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

export interface VoiceDiagnosticsDisplayProps {
  error?: string | null;
  errorCode?: string | null;
  onTestSuccess?: () => void;
  autoRun?: boolean; // Auto-run diagnostics on mount
}

export function VoiceDiagnosticsDisplay({
  error,
  errorCode,
  onTestSuccess,
  autoRun = true,
}: VoiceDiagnosticsDisplayProps) {
  const [diagnostics, setDiagnostics] = useState<DiagnosticResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [testResult, setTestResult] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');

  // Run diagnostics on mount if autoRun is true
  useEffect(() => {
    if (autoRun && !diagnostics) {
      runDiagnostics();
    }
  }, [autoRun]);

  const runDiagnostics = async () => {
    setIsRunning(true);
    setTestResult('idle');
    try {
      const result = await runMicrophoneDiagnostics();
      setDiagnostics(result);
    } catch (err) {
      console.error('Diagnostics failed:', err);
    } finally {
      setIsRunning(false);
    }
  };

  const testMicrophone = async () => {
    setTestResult('testing');
    try {
      // Through the mic singleton — a direct getUserMedia here double-lights
      // the mic beside a live recording and tears down the warm iOS grant.
      await acquireMicStream();
      releaseMicStream();
      setTestResult('success');
      onTestSuccess?.();
      // Re-run diagnostics after successful test
      await runDiagnostics();
    } catch (err) {
      console.error('Microphone test failed:', err);
      setTestResult('failed');
      // Re-run diagnostics to update error state
      await runDiagnostics();
    }
  };

  if (!diagnostics && isRunning) {
    return (
      <div className="flex flex-col items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-sm text-muted-foreground">Running diagnostics...</p>
      </div>
    );
  }

  if (!diagnostics) {
    return (
      <div className="flex flex-col items-center justify-center py-8">
        <Button onClick={runDiagnostics} disabled={isRunning}>
          <RefreshCw className={cn('h-4 w-4 mr-2', isRunning && 'animate-spin')} />
          Run Diagnostics
        </Button>
      </div>
    );
  }

  const hasIssues = diagnostics.issues.length > 0;
  const canFix = canUserFixIssue(diagnostics);
  const fixInstructions = getFixInstructions(diagnostics);

  return (
    <div className="space-y-4">
      {/* Error Display */}
      {error && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-destructive mb-1">Error Occurred</p>
              <p className="text-sm text-muted-foreground">{error}</p>
              {errorCode && (
                <p className="text-xs text-muted-foreground mt-1">Code: {errorCode}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* System Status */}
      <div className="grid grid-cols-2 gap-3">
        <StatusCard
          icon={diagnostics.hasMediaDevices ? CheckCircle : XCircle}
          title="Browser Support"
          status={diagnostics.hasMediaDevices ? 'success' : 'error'}
          message={diagnostics.hasMediaDevices ? 'Supported' : 'Not Supported'}
        />
        <StatusCard
          icon={diagnostics.isSecureContext ? CheckCircle : XCircle}
          title="Secure Connection"
          status={diagnostics.isSecureContext ? 'success' : 'error'}
          message={diagnostics.isSecureContext ? 'HTTPS' : 'HTTP (Insecure)'}
        />
        <StatusCard
          icon={diagnostics.permissionState === 'granted' ? CheckCircle : diagnostics.permissionState === 'denied' ? XCircle : AlertCircle}
          title="Permission Status"
          status={diagnostics.permissionState === 'granted' ? 'success' : diagnostics.permissionState === 'denied' ? 'error' : 'warning'}
          message={diagnostics.permissionState === 'prompt' ? 'Not Requested' : diagnostics.permissionState.charAt(0).toUpperCase() + diagnostics.permissionState.slice(1)}
        />
        <StatusCard
          icon={diagnostics.availableDevices.length > 0 ? CheckCircle : XCircle}
          title="Microphone Found"
          status={diagnostics.availableDevices.length > 0 ? 'success' : 'error'}
          message={`${diagnostics.availableDevices.length} device(s)`}
        />
      </div>

      {/* Browser Info */}
      <div className="bg-muted/50 rounded-lg p-3 text-sm">
        <p className="text-muted-foreground">
          <strong>Browser:</strong> {diagnostics.browserInfo.name} {diagnostics.browserInfo.version}
          {diagnostics.browserInfo.isMobile && ' (Mobile)'}
        </p>
      </div>

      {/* Issues */}
      {hasIssues && (
        <div className="space-y-2">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-destructive" />
            Issues Detected ({diagnostics.issues.length})
          </h3>
          <div className="space-y-2">
            {diagnostics.issues.map((issue, index) => (
              <div
                key={index}
                className={cn(
                  'rounded-lg p-3 border',
                  issue.severity === 'error' && 'bg-destructive/10 border-destructive/20',
                  issue.severity === 'warning' && 'bg-yellow-500/10 border-yellow-500/20',
                  issue.severity === 'info' && 'bg-blue-500/10 border-blue-500/20'
                )}
              >
                <p className="font-medium text-sm mb-1">{issue.message}</p>
                <p className="text-xs text-muted-foreground">{issue.solution}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Fix Instructions */}
      {canFix && fixInstructions.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Settings className="h-4 w-4" />
            How to Fix
          </h3>
          <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 space-y-2">
            {fixInstructions.map((instruction, index) => (
              <p key={index} className="text-sm">
                {instruction.startsWith('**') ? (
                  <strong>{instruction.replace(/\*\*/g, '')}</strong>
                ) : (
                  instruction
                )}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {diagnostics.recommendations.length > 0 && (
        <Accordion type="single" collapsible className="border rounded-lg">
          <AccordionItem value="recommendations" className="border-none">
            <AccordionTrigger className="px-4 py-3 hover:no-underline">
              <span className="text-sm font-medium">Additional Recommendations</span>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              <ul className="space-y-2 text-sm text-muted-foreground">
                {diagnostics.recommendations.map((rec, index) => (
                  <li key={index} className="flex gap-2">
                    <span>•</span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}

      {/* Test Microphone */}
      <div className="flex flex-col gap-2 pt-2">
        <Button
          onClick={testMicrophone}
          disabled={testResult === 'testing' || !diagnostics.hasMediaDevices}
          className="w-full"
          variant={testResult === 'success' ? 'default' : 'outline'}
        >
          {testResult === 'testing' ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Testing...
            </>
          ) : testResult === 'success' ? (
            <>
              <CheckCircle className="h-4 w-4 mr-2" />
              Test Successful
            </>
          ) : testResult === 'failed' ? (
            <>
              <XCircle className="h-4 w-4 mr-2" />
              Test Failed - Try Again
            </>
          ) : (
            <>
              <Mic className="h-4 w-4 mr-2" />
              Test Microphone Now
            </>
          )}
        </Button>

        {testResult === 'success' && (
          <p className="text-xs text-center text-green-600 dark:text-green-400">
            ✓ Microphone is working! You're ready to use voice input.
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-4 border-t">
        <Button
          variant="outline"
          onClick={runDiagnostics}
          disabled={isRunning}
          className="flex-1"
        >
          <RefreshCw className={cn('h-4 w-4 mr-2', isRunning && 'animate-spin')} />
          Re-run Diagnostics
        </Button>
        <Button
          variant="outline"
          onClick={() => window.open('https://support.google.com/chrome/answer/2693767', '_blank')}
          className="flex-1"
        >
          <ExternalLink className="h-4 w-4 mr-2" />
          Browser Help
        </Button>
      </div>
    </div>
  );
}

// Helper component for status cards
function StatusCard({
  icon: Icon,
  title,
  status,
  message,
}: {
  icon: any;
  title: string;
  status: 'success' | 'error' | 'warning';
  message: string;
}) {
  return (
    <div className="border rounded-lg p-3 flex items-start gap-3">
      <Icon
        className={cn(
          'h-5 w-5 flex-shrink-0 mt-0.5',
          status === 'success' && 'text-green-600 dark:text-green-400',
          status === 'error' && 'text-destructive',
          status === 'warning' && 'text-yellow-600 dark:text-yellow-400'
        )}
      />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-muted-foreground mb-0.5">{title}</p>
        <p className="text-sm font-medium truncate">{message}</p>
      </div>
    </div>
  );
}

