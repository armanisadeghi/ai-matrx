'use client';

import React, { useState } from 'react';
import { ComponentEntry } from '../parts/component-list';
import { ComponentDisplayWrapper } from '../component-usage';
import { VoiceInputButton } from '@/components/official/VoiceInputButton';
import { toast } from 'sonner';

interface ComponentDisplayProps {
  component?: ComponentEntry;
}

export default function VoiceInputButtonDisplay({ component }: ComponentDisplayProps) {
  const [transcript, setTranscript] = useState('');

  if (!component) return null;
  
  // Example code with all available props and their default values
  const code = `import { VoiceInputButton } from '@/components/official/VoiceInputButton';
import { toast } from 'sonner';

<VoiceInputButton
  onTranscriptionComplete={(text) => {
    console.log('Transcribed:', text);
    toast.success('Voice input received');
  }}
  onError={(error) => {
    console.error('Error:', error);
    toast.error('Voice input failed', { description: error });
  }}
  
  variant="button"              // Options: 'button' | 'inline' (default: 'inline')
                                 // 'button' = Full button with text
                                 // 'inline' = Icon only
  
  buttonText="Voice Input"       // Text for button variant (default: 'Explain it Instead')
  size="md"                      // Options: 'sm' | 'md' | 'lg' (default: 'md')
  disabled={false}               // Disable the button (default: false)
  className=""                   // Additional CSS classes
/>`;

  return (
    <ComponentDisplayWrapper
      component={component}
      code={code}
      description="Complete voice recording button that handles recording, transcription, and returns the text. Shows recording state with visual feedback. Available in two variants: full button with text or compact icon-only mode."
    >
      <div className="w-full max-w-2xl space-y-6">
        {/* Button Variant */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">Button Variant (with text)</h3>
          <VoiceInputButton
            variant="button"
            buttonText="Voice Input"
            size="md"
            onTranscriptionComplete={(text) => {
              setTranscript(text);
              toast.success('Voice input received', {
                description: `"${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`,
              });
            }}
            onError={(error) => {
              toast.error('Voice input failed', {
                description: error,
              });
            }}
          />
        </div>

        {/* Inline Variant */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">Inline Variant (icon only)</h3>
          <VoiceInputButton
            variant="inline"
            size="md"
            onTranscriptionComplete={(text) => {
              setTranscript(text);
              toast.success('Voice input received');
            }}
            onError={(error) => {
              toast.error('Voice input failed', {
                description: error,
              });
            }}
          />
        </div>

        {/* Show last transcript */}
        {transcript && (
          <div className="p-4 bg-muted rounded-lg border">
            <div className="text-xs font-semibold text-muted-foreground mb-1">Last Transcription:</div>
            <div className="text-sm">{transcript}</div>
          </div>
        )}
      </div>
    </ComponentDisplayWrapper>
  );
}

