"use client";

import React from "react";
import { Mic } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { VoiceDiagnosticsDisplay } from "@/features/audio/components/VoiceDiagnosticsDisplay";

export default function VoiceSettingsPage() {
  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-3">
          <Mic className="h-7 w-7 text-primary" />
          Voice & Microphone
        </h1>
      </div>

      {/* Diagnostics Card */}
      <Card>
        <CardHeader>
          <CardTitle>Microphone Diagnostics</CardTitle>
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
                  Live voice conversation - talk instead of type in voice chat
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
              • What you say is sent to AI Matrx&apos;s transcription service
              to be turned into text
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
