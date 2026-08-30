/**
 * Form Template (default)
 *
 * Classic prompt app layout: form inputs at top, AI response rendered below.
 * Single execution — no follow-up conversation. This is the original pattern.
 *
 * Display mode: "form"
 */

const formTemplate = `import React, { useState, useMemo } from 'react';
import { PartyPopper, Loader2, AlertCircle } from 'lucide-react';
import MarkdownStream from '@/components/MarkdownStream';
import { Button } from '@/components/ui/button';
import { Input } from '@ai-matrx/design-system';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';

export default function FormApp({
  onExecute,
  response,
  isStreaming,
  isExecuting,
  error,
  rateLimitInfo,
  appName,
  appTagline,
}) {
  const [variables, setVariables] = useState({
    topic: '',
    details: '',
    style: 'professional',
  });

  const isFormValid = useMemo(() => variables.topic.trim() !== '', [variables]);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!isFormValid) return;
    await onExecute(variables);
  };

  return (
    <div className="max-w-4xl mx-auto px-6 pb-6 space-y-6">
      <Card className="bg-card border-border">
        <CardHeader className="bg-muted/50">
          <CardTitle className="flex items-center gap-2">
            <PartyPopper className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            {appName || 'Generate Content'}
          </CardTitle>
          {appTagline && (
            <p className="text-sm text-muted-foreground mt-1">{appTagline}</p>
          )}
        </CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="topic">Topic *</Label>
              <Input
                id="topic"
                value={variables.topic}
                onChange={(e) => setVariables({ ...variables, topic: e.target.value })}
                placeholder="Enter your topic..."
                disabled={isExecuting || isStreaming}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="details">Additional Details (Optional)</Label>
              <Textarea
                id="details"
                value={variables.details}
                onChange={(e) => setVariables({ ...variables, details: e.target.value })}
                placeholder="Provide any additional context..."
                rows={3}
                disabled={isExecuting || isStreaming}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="style">Style</Label>
              <Select
                value={variables.style}
                onValueChange={(value) => setVariables({ ...variables, style: value })}
                disabled={isExecuting || isStreaming}
              >
                <SelectTrigger id="style">
                  <SelectValue placeholder="Select style" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="casual">Casual</SelectItem>
                  <SelectItem value="professional">Professional</SelectItem>
                  <SelectItem value="academic">Academic</SelectItem>
                  <SelectItem value="creative">Creative</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              type="submit"
              disabled={!isFormValid || isExecuting || isStreaming}
              className="w-full"
            >
              {isExecuting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {isExecuting ? 'Generating...' : 'Generate Content'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {error && (
        <div className="p-4 bg-destructive/10 border border-destructive rounded-lg">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-destructive">{error.type}</p>
              <p className="text-sm text-destructive/80 mt-1">{error.message}</p>
            </div>
          </div>
        </div>
      )}

      {rateLimitInfo && rateLimitInfo.remaining <= 2 && rateLimitInfo.remaining > 0 && (
        <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <p className="text-sm text-amber-800 dark:text-amber-200">
            Only {rateLimitInfo.remaining} free {rateLimitInfo.remaining === 1 ? 'use' : 'uses'} remaining.
            <a href="/sign-up" className="underline ml-1 font-semibold">Sign up</a> for unlimited access.
          </p>
        </div>
      )}

      {response && (
        <Card className="bg-card border-border">
          <CardHeader className="bg-muted/50">
            <CardTitle className="flex items-center gap-2">
              <PartyPopper className="w-5 h-5 text-green-600 dark:text-green-400" />
              Result
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <MarkdownStream content={response} />
            {isStreaming && (
              <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">Generating...</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}`;

export default formTemplate;
