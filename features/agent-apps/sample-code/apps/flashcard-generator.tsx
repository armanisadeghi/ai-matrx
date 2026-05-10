import React, { useState, useMemo } from 'react';
import { BookOpen, Sparkles, Loader2, GraduationCap, Brain, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import MarkdownStream from '@/components/Markdown';

export default function FlashcardGenerator({ onExecute, response, isExecuting, isStreaming, error, rateLimitInfo }) {
  const [variables, setVariables] = useState({
    topic_or_data: '',
    count: 30
  });
  const [isFormExpanded, setIsFormExpanded] = useState(true);
  const [isWaitingForStream, setIsWaitingForStream] = useState(false);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setIsFormExpanded(false);
    setIsWaitingForStream(true);
    await onExecute(variables);
  };

  const isFormValid = useMemo(() => {
    return variables.topic_or_data.trim().length > 0;
  }, [variables.topic_or_data]);

  // Reset waiting state when response starts streaming
  React.useEffect(() => {
    if (response) {
      setIsWaitingForStream(false);
    }
  }, [response]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && isFormValid && !isExecuting && !isStreaming) {
      handleSubmit();
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-6 pb-12 space-y-6">
      {/* Rate Limit Warning */}
      {rateLimitInfo && rateLimitInfo.remaining <= 2 && rateLimitInfo.remaining > 0 && (
        <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <p className="text-sm text-amber-800 dark:text-amber-200">
            ⚠️ Only {rateLimitInfo.remaining} free uses remaining.
            <a href="/sign-up" className="underline ml-1 font-semibold hover:text-amber-900 dark:hover:text-amber-100">
              Sign up
            </a> for unlimited access.
          </p>
        </div>
      )}

      {/* Input Form */}
      <Card className="bg-card border-border shadow-md">
        <CardHeader 
          className="bg-muted/50 border-b border-border cursor-pointer hover:bg-muted/70 transition-colors"
          onClick={() => response && setIsFormExpanded(!isFormExpanded)}
        >
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <CardTitle className="flex items-center gap-2 text-xl">
                <GraduationCap className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                Flashcard Generator
              </CardTitle>
              {!isFormExpanded && response && (
                <p className="text-sm text-muted-foreground mt-1">
                  {variables.topic_or_data.slice(0, 60)}
                  {variables.topic_or_data.length > 60 ? '...' : ''} • {variables.count} cards
                </p>
              )}
            </div>
            {response && (
              <Button
                variant="ghost"
                size="sm"
                className="ml-2"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsFormExpanded(!isFormExpanded);
                }}
              >
                {isFormExpanded ? (
                  <ChevronUp className="w-5 h-5" />
                ) : (
                  <ChevronDown className="w-5 h-5" />
                )}
              </Button>
            )}
          </div>
        </CardHeader>
        {isFormExpanded && (
          <CardContent className="pt-6 space-y-6">
          {/* Topic Input */}
          <div className="space-y-2">
            <Label htmlFor="topic" className="text-base font-semibold">
              Topic or Content
            </Label>
            <Textarea
              id="topic"
              value={variables.topic_or_data}
              onChange={(e) => setVariables({...variables, topic_or_data: e.target.value})}
              onKeyDown={handleKeyDown}
              placeholder="Enter your study topic (e.g., 'Photosynthesis', 'Spanish verbs', 'World War II')..."
              rows={5}
              disabled={isExecuting || isStreaming}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              Press Cmd/Ctrl + Enter to generate
            </p>
          </div>

          {/* Flashcard Count Slider */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">
              Number of Flashcards: <span className="text-indigo-600 dark:text-indigo-400">{variables.count}</span>
            </Label>
            <Slider
              value={[variables.count]}
              onValueChange={([value]) => setVariables({...variables, count: value})}
              min={10}
              max={50}
              step={5}
              disabled={isExecuting || isStreaming}
              className="cursor-pointer"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>10</span>
              <span>50</span>
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <div className="p-4 bg-destructive/10 border border-destructive rounded-lg">
              <p className="font-semibold text-destructive">{error.type}</p>
              <p className="text-sm text-destructive/80 mt-1">{error.message}</p>
            </div>
          )}

          {/* Generate Button */}
          <Button
            onClick={handleSubmit}
            disabled={!isFormValid || isExecuting || isStreaming}
            className="w-full h-11 text-base font-semibold"
            size="lg"
          >
            {isExecuting ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5 mr-2" />
                Generate Flashcards
              </>
            )}
          </Button>
          </CardContent>
        )}
      </Card>

      {/* Loading State - Before Stream Starts */}
      {isWaitingForStream && !response && (
        <Card className="bg-card border-border shadow-md">
          <CardContent className="pt-12 pb-12">
            <div className="flex flex-col items-center justify-center gap-4">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600 dark:text-indigo-400" />
              <div className="text-center space-y-1">
                <p className="text-base font-medium text-foreground">
                  Preparing your flashcards...
                </p>
                <p className="text-sm text-muted-foreground">
                  Analyzing your topic and generating {variables.count} cards
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results Display */}
      {response && (
        <Card className="bg-card border-border shadow-md">
          <CardHeader className="bg-muted/50 border-b border-border">
            <CardTitle className="flex items-center gap-2 text-xl">
              <Brain className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              Your Flashcards
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 bg-textured">
            <MarkdownStream content={response} />
            
            {isStreaming && (
              <div className="flex items-center gap-2 mt-6 pt-4 border-t border-border">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-600 dark:text-indigo-400" />
                <span className="text-sm text-muted-foreground">
                  Creating your flashcards...
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Study Tips */}
      {response && !isStreaming && (
        <Card className="bg-muted/30 border-border">
          <CardContent className="pt-5 pb-5">
            <h3 className="font-semibold text-sm mb-2.5 text-muted-foreground">
              Study Tips
            </h3>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              <li>• Review daily for the first week, then space out sessions</li>
              <li>• Shuffle the order to test true understanding</li>
              <li>• Focus extra time on difficult cards</li>
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}