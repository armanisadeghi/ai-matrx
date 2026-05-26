'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageSquare, Send, Settings, BarChart3, Webhook, Phone } from 'lucide-react';
import PhoneVerification from './components/PhoneVerification';
import SendSMS from './components/SendSMS';
import ConversationsList from './components/ConversationsList';
import NotificationPreferences from './components/NotificationPreferences';
import Analytics from './components/Analytics';
import WebhookLogs from './components/WebhookLogs';

export default function SMSTestPage() {
  const [activeTab, setActiveTab] = useState('send');

  return (
    <div className="h-[calc(100vh-2.5rem)] flex flex-col overflow-hidden bg-textured">
      <div className="flex-shrink-0 border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold">SMS Integration Testing</h1>
          <p className="text-sm text-muted-foreground">
            Test all SMS features with your phone number
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
          <div className="flex-shrink-0 border-b bg-card/30 backdrop-blur-sm">
            <div className="container mx-auto px-4">
              <TabsList className="w-full justify-start h-12 bg-transparent">
                <TabsTrigger value="send" className="gap-2">
                  <Send className="h-4 w-4" />
                  Send SMS
                </TabsTrigger>
                <TabsTrigger value="verify" className="gap-2">
                  <Phone className="h-4 w-4" />
                  Verify Phone
                </TabsTrigger>
                <TabsTrigger value="conversations" className="gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Conversations
                </TabsTrigger>
                <TabsTrigger value="preferences" className="gap-2">
                  <Settings className="h-4 w-4" />
                  Preferences
                </TabsTrigger>
                <TabsTrigger value="analytics" className="gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Analytics
                </TabsTrigger>
                <TabsTrigger value="webhooks" className="gap-2">
                  <Webhook className="h-4 w-4" />
                  Webhook Logs
                </TabsTrigger>
              </TabsList>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="container mx-auto px-4 py-6">
              <TabsContent value="send" className="mt-0">
                <SendSMS />
              </TabsContent>

              <TabsContent value="verify" className="mt-0">
                <PhoneVerification />
              </TabsContent>

              <TabsContent value="conversations" className="mt-0">
                <ConversationsList />
              </TabsContent>

              <TabsContent value="preferences" className="mt-0">
                <NotificationPreferences />
              </TabsContent>

              <TabsContent value="analytics" className="mt-0">
                <Analytics />
              </TabsContent>

              <TabsContent value="webhooks" className="mt-0">
                <WebhookLogs />
              </TabsContent>
            </div>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
