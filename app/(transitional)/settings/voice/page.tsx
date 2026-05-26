"use client";

import React from "react";
import { Mic, HelpCircle } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { VoiceDiagnosticsDisplay } from "@/features/audio/components/VoiceDiagnosticsDisplay";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function VoiceSettingsPage() {
  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-3">
          <Mic className="h-7 w-7 text-primary" />
          Voice & Microphone
        </h1>
        <p className="text-sm md:text-base text-gray-600 dark:text-gray-400 mt-2">
          Test your microphone and troubleshoot voice input issues
        </p>
      </div>

      {/* Info Alert */}
      <Alert className="mb-6">
        <HelpCircle className="h-4 w-4" />
        <AlertDescription>
          Use this page to check if your microphone is working correctly and get
          help fixing any issues. Voice input is used throughout the app for
          transcription and AI assistance.
        </AlertDescription>
      </Alert>

      {/* Diagnostics Card */}
      <Card>
        <CardHeader>
          <CardTitle>Microphone Diagnostics</CardTitle>
          <CardDescription>
            Check your microphone status and permissions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <VoiceDiagnosticsDisplay autoRun={true} />
        </CardContent>
      </Card>

      {/* Additional Info */}
      <div className="mt-6 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Where Voice Input Is Used</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex gap-2">
                <span>•</span>
                <span>
                  Prompt Generator - Add voice descriptions for AI prompts
                </span>
              </li>
              <li className="flex gap-2">
                <span>•</span>
                <span>
                  Text Fields - Any textarea with a microphone icon supports
                  voice input
                </span>
              </li>
              <li className="flex gap-2">
                <span>•</span>
                <span>
                  Notes & Documentation - Quickly capture ideas with your voice
                </span>
              </li>
              <li className="flex gap-2">
                <span>•</span>
                <span>
                  AI Conversations - Speak instead of typing your questions
                </span>
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Privacy & Security</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              • Your voice recordings are sent to our secure transcription
              service (Groq Whisper API)
            </p>
            <p>
              • Recordings are processed in real-time and not stored permanently
            </p>
            <p>
              • You can revoke microphone permission at any time through your
              browser settings
            </p>
            <p>• Voice input only works on secure (HTTPS) connections</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
