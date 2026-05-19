"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Zap } from 'lucide-react';
import { PromptGenerator } from '../actions/prompt-generator/PromptGenerator';

export function GeneratePromptButton() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button
        onClick={() => setIsOpen(true)}
        className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white"
      >
        <Zap className="h-4 w-4 mr-2" />
        <span className="hidden sm:inline">Generate with AI</span>
        <span className="sm:hidden">Generate</span>
      </Button>
      
      <PromptGenerator
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
      />
    </>
  );
}

