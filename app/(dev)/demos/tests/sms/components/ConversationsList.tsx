'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, MessageSquare, RefreshCw, AlertCircle, Phone, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface Conversation {
  id: string;
  external_phone_number: string;
  our_phone_number: string;
  status: string;
  conversation_type: string;
  last_message_at: string;
  last_message_preview: string;
  last_message_direction: string;
  message_count: number;
  unread_count: number;
  created_at: string;
}

interface Message {
  id: string;
  direction: string;
  from_number: string;
  to_number: string;
  body: string;
  status: string;
  created_at: string;
}

export default function ConversationsList() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchConversations = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/sms/conversations');
      const data = await response.json();

      if (response.ok) {
        const conversations = data.data?.conversations || data.conversations || data.data || [];
        setConversations(Array.isArray(conversations) ? conversations : []);
      } else {
        setError(data.msg || data.error || 'Failed to fetch conversations');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async (conversationId: string) => {
    setLoadingMessages(true);

    try {
      const response = await fetch(`/api/sms/messages?conversationId=${conversationId}`);
      const data = await response.json();

      if (response.ok) {
        const messages = data.data?.messages || data.messages || data.data || [];
        setMessages(Array.isArray(messages) ? messages : []);
      } else {
        setError(data.msg || data.error || 'Failed to fetch messages');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoadingMessages(false);
    }
  };

  useEffect(() => {
    fetchConversations();
  }, []);

  useEffect(() => {
    if (selectedConversation) {
      fetchMessages(selectedConversation);
    }
  }, [selectedConversation]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'closed':
        return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
      case 'blocked':
        return 'bg-red-500/10 text-red-500 border-red-500/20';
      default:
        return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Conversations</CardTitle>
              <CardDescription>
                All SMS conversations ({conversations.length})
              </CardDescription>
            </div>
            <Button
              onClick={fetchConversations}
              variant="outline"
              size="sm"
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MessageSquare className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No conversations yet</p>
              <p className="text-sm">Send an SMS to create a conversation</p>
            </div>
          ) : (
            <div className="space-y-2">
              {conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => setSelectedConversation(conv.id)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    selectedConversation === conv.id
                      ? 'bg-primary/10 border-primary'
                      : 'bg-card hover:bg-muted/50 border-border'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{conv.external_phone_number}</span>
                    </div>
                    <Badge variant="outline" className={getStatusColor(conv.status)}>
                      {conv.status}
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground line-clamp-1 mb-1">
                    {conv.last_message_preview || 'No messages yet'}
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" />
                      {conv.message_count} messages
                      {conv.unread_count > 0 && (
                        <Badge variant="destructive" className="ml-1 h-4 px-1 text-xs">
                          {conv.unread_count}
                        </Badge>
                      )}
                    </span>
                    {conv.last_message_at && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(new Date(conv.last_message_at), { addSuffix: true })}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Messages</CardTitle>
          <CardDescription>
            {selectedConversation
              ? 'Conversation message history'
              : 'Select a conversation to view messages'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!selectedConversation ? (
            <div className="text-center py-8 text-muted-foreground">
              <MessageSquare className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>Select a conversation</p>
            </div>
          ) : loadingMessages ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MessageSquare className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No messages in this conversation</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[500px] overflow-y-auto">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`p-3 rounded-lg ${
                    msg.direction === 'outbound'
                      ? 'bg-primary/10 ml-8'
                      : 'bg-muted mr-8'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs font-medium">
                      {msg.direction === 'outbound' ? 'Sent' : 'Received'}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {msg.status}
                    </Badge>
                  </div>
                  <div className="text-sm mb-1">{msg.body}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
