/**
 * Form-to-Chat Template
 *
 * Starts as a form for the initial AI request, then transitions to a chat
 * interface after the first response. The form collapses into a summary bar,
 * and a chat input appears at the bottom for follow-up conversation.
 *
 * Key behavior:
 * - Initial state: full form with variables
 * - After first execution: form collapses, response displays, chat input appears
 * - Follow-up messages use onExecute({}, userInput) to continue the conversation
 * - Uses conversationId to track conversation continuity
 * - "New conversation" button resets everything via onResetConversation
 *
 * Display mode: "form-to-chat"
 */

const formToChatTemplate = `import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Stars, Loader2, AlertCircle, Send, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import MarkdownStream from '@/components/MarkdownStream';
import { Button } from '@/components/ui/button';
import { Input } from '@ai-matrx/design-system';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';

export default function FormToChatApp({
  onExecute,
  response,
  isStreaming,
  isExecuting,
  error,
  rateLimitInfo,
  appName,
  appTagline,
  conversationId,
  onResetConversation,
}) {
  const [variables, setVariables] = useState({
    topic: '',
    details: '',
  });
  const [chatInput, setChatInput] = useState('');
  const [isFormExpanded, setIsFormExpanded] = useState(true);
  const [messages, setMessages] = useState([]);
  const chatInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  const isFormValid = useMemo(() => variables.topic.trim() !== '', [variables]);
  const hasResponse = !!conversationId || response.length > 0;

  // Track message history locally for display
  useEffect(() => {
    if (response && !isStreaming && conversationId) {
      // When streaming completes, save the response as a message
      setMessages(prev => {
        const lastMsg = prev[prev.length - 1];
        if (lastMsg && lastMsg.role === 'assistant' && lastMsg.isStreaming) {
          // Update the streaming message with final content
          return prev.map((m, i) =>
            i === prev.length - 1 ? { ...m, content: response, isStreaming: false } : m
          );
        }
        return prev;
      });
    }
  }, [response, isStreaming, conversationId]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, response]);

  // Focus chat input after first response
  useEffect(() => {
    if (hasResponse && !isStreaming && chatInputRef.current) {
      chatInputRef.current.focus();
    }
  }, [hasResponse, isStreaming]);

  // Collapse form after first response
  useEffect(() => {
    if (hasResponse) {
      setIsFormExpanded(false);
    }
  }, [hasResponse]);

  const handleFormSubmit = async (e) => {
    e?.preventDefault();
    if (!isFormValid || isExecuting) return;

    // Add user message
    const userContent = variables.details
      ? variables.topic + '\\n\\n' + variables.details
      : variables.topic;
    setMessages(prev => [...prev, { role: 'user', content: userContent }]);
    setMessages(prev => [...prev, { role: 'assistant', content: '', isStreaming: true }]);

    await onExecute(variables);
  };

  const handleChatSubmit = async (e) => {
    e?.preventDefault();
    if (!chatInput.trim() || isExecuting || isStreaming) return;

    const userMsg = chatInput.trim();
    setChatInput('');

    // Add user and placeholder assistant messages
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setMessages(prev => [...prev, { role: 'assistant', content: '', isStreaming: true }]);

    // Continue conversation with userInput
    await onExecute({}, userMsg);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleChatSubmit(e);
    }
  };

  const handleReset = () => {
    setMessages([]);
    setVariables({ topic: '', details: '' });
    setChatInput('');
    setIsFormExpanded(true);
    onResetConversation?.();
  };

  return (
    <div className="h-full flex flex-col">
      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 pb-4">
        <div className="max-w-3xl mx-auto space-y-4 pt-4">

          {/* Form — full when no response, collapsible after */}
          <Card className="bg-card border-border">
            {isFormExpanded ? (
              <>
                <CardHeader className="bg-muted/50">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Stars className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                      {appName || 'Get Started'}
                    </CardTitle>
                    {hasResponse && (
                      <Button variant="ghost" size="sm" onClick={() => setIsFormExpanded(false)}>
                        <ChevronUp className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                  {appTagline && <p className="text-sm text-muted-foreground mt-1">{appTagline}</p>}
                </CardHeader>
                <CardContent className="pt-6">
                  <form onSubmit={handleFormSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="topic">Topic *</Label>
                      <Input
                        id="topic"
                        value={variables.topic}
                        onChange={(e) => setVariables({ ...variables, topic: e.target.value })}
                        placeholder="What would you like to explore?"
                        disabled={isExecuting || isStreaming || hasResponse}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="details">Additional Context (Optional)</Label>
                      <Textarea
                        id="details"
                        value={variables.details}
                        onChange={(e) => setVariables({ ...variables, details: e.target.value })}
                        placeholder="Provide any extra details or requirements..."
                        rows={3}
                        disabled={isExecuting || isStreaming || hasResponse}
                      />
                    </div>
                    {!hasResponse && (
                      <Button type="submit" disabled={!isFormValid || isExecuting} className="w-full">
                        {isExecuting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        {isExecuting ? 'Starting...' : 'Start Conversation'}
                      </Button>
                    )}
                  </form>
                </CardContent>
              </>
            ) : (
              <CardContent className="py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-muted-foreground">Topic:</p>
                    <p className="text-sm text-foreground truncate">{variables.topic}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button variant="outline" size="sm" onClick={() => setIsFormExpanded(true)}>
                      <ChevronDown className="w-4 h-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleReset}>
                      <RotateCcw className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            )}
          </Card>

          {/* Error display */}
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

          {/* Message history */}
          {messages.map((msg, i) => (
            <div key={i} className={msg.role === 'user' ? 'flex justify-end' : ''}>
              {msg.role === 'user' ? (
                <div className="max-w-[80%] px-4 py-2 rounded-2xl bg-primary text-primary-foreground">
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                </div>
              ) : (
                <Card className="bg-card border-border">
                  <CardContent className="pt-4 bg-textured">
                    {i === messages.length - 1 && (isStreaming || msg.isStreaming) ? (
                      <>
                        {response ? (
                          <MarkdownStream content={response} />
                        ) : (
                          <div className="flex items-center gap-2 py-4">
                            <Loader2 className="w-5 h-5 animate-spin text-primary" />
                            <span className="text-sm text-muted-foreground">Thinking...</span>
                          </div>
                        )}
                        {isStreaming && response && (
                          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">Generating...</span>
                          </div>
                        )}
                      </>
                    ) : (
                      <MarkdownStream content={msg.content || response} />
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          ))}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Rate limit warning */}
      {rateLimitInfo && rateLimitInfo.remaining <= 2 && rateLimitInfo.remaining > 0 && (
        <div className="flex-shrink-0 px-4 md:px-6">
          <div className="max-w-3xl mx-auto p-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg mb-2">
            <p className="text-xs text-amber-800 dark:text-amber-200 text-center">
              {rateLimitInfo.remaining} free {rateLimitInfo.remaining === 1 ? 'use' : 'uses'} remaining.
              <a href="/sign-up" className="underline ml-1 font-semibold">Sign up</a> for more.
            </p>
          </div>
        </div>
      )}

      {/* Chat input — appears after first response */}
      {hasResponse && (
        <div className="flex-shrink-0 border-t border-border bg-card/50 backdrop-blur-sm px-4 md:px-6 py-3">
          <form onSubmit={handleChatSubmit} className="max-w-3xl mx-auto">
            <div className="flex items-end gap-2">
              <Textarea
                ref={chatInputRef}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask a follow-up question..."
                rows={1}
                disabled={isExecuting || isStreaming}
                className="flex-1 resize-none min-h-[42px] max-h-[120px]"
              />
              <Button
                type="submit"
                size="sm"
                disabled={!chatInput.trim() || isExecuting || isStreaming}
                className="h-[42px] px-3"
              >
                {isExecuting || isStreaming ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}`;

export default formToChatTemplate;
