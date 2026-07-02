/**
 * Text-to-Speech API Route
 * 
 * Secure server-side proxy for Groq TTS
 * Uses playai-tts for high-quality English speech generation
 */

import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { resolveUser } from '@/utils/supabase/resolveUser';

// Initialize Groq client with API key from environment
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// Available English voices for playai-tts
export const ENGLISH_VOICES = [
  'Arista-PlayAI',
  'Atlas-PlayAI',
  'Basil-PlayAI',
  'Briggs-PlayAI',
  'Calum-PlayAI',
  'Celeste-PlayAI',
  'Cheyenne-PlayAI', // Default
  'Chip-PlayAI',
  'Cillian-PlayAI',
  'Deedee-PlayAI',
  'Fritz-PlayAI',
  'Gail-PlayAI',
  'Indigo-PlayAI',
  'Mamaw-PlayAI',
  'Mason-PlayAI',
  'Mikail-PlayAI',
  'Mitch-PlayAI',
  'Quinn-PlayAI',
  'Thunder-PlayAI'
] as const;

export type EnglishVoice = typeof ENGLISH_VOICES[number];

export async function POST(request: NextRequest) {
  try {
    const { user } = await resolveUser(request);

    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required. Provide a session cookie or Bearer token.' },
        { status: 401 },
      );
    }

    const body = await request.json();
    const { text, voice = 'Cheyenne-PlayAI', model = 'playai-tts' } = body;

    // Validate input
    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: 'Text is required and must be a string' },
        { status: 400 }
      );
    }

    // Validate text length (10K characters max)
    if (text.length > 10000) {
      return NextResponse.json(
        { error: 'Text exceeds maximum length of 10,000 characters' },
        { status: 400 }
      );
    }

    // Validate voice
    if (model === 'playai-tts' && !ENGLISH_VOICES.includes(voice as EnglishVoice)) {
      return NextResponse.json(
        { error: `Invalid voice. Must be one of: ${ENGLISH_VOICES.join(', ')}` },
        { status: 400 }
      );
    }

    // Call Groq TTS API
    const response = await groq.audio.speech.create({
      model,
      voice,
      input: text,
      response_format: 'wav',
    });

    // Convert response to buffer
    const audioBuffer = await response.arrayBuffer();

    // Return audio with appropriate headers
    return new NextResponse(audioBuffer, {
      headers: {
        'Content-Type': 'audio/wav',
        'Content-Length': audioBuffer.byteLength.toString(),
        'Cache-Control': 'public, max-age=31536000', // Cache for 1 year
      },
    });

  } catch (error: unknown) {
    console.error('TTS error:', error);

    // Handle specific Groq API errors
    if (error instanceof Groq.APIError) {
      if (error.status === 401) {
        return NextResponse.json(
          { error: 'API authentication failed' },
          { status: 500 }
        );
      }

      if (error.status === 429) {
        return NextResponse.json(
          { error: 'Rate limit exceeded. Please try again later.' },
          { status: 429 }
        );
      }
    }

    // Generic error response
    return NextResponse.json(
      {
        error: 'Text-to-speech generation failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Optional: Add GET endpoint for listing available voices
export async function GET() {
  return NextResponse.json({
    status: 'ready',
    service: 'text-to-speech',
    model: 'playai-tts',
    voices: ENGLISH_VOICES,
    defaultVoice: 'Cheyenne-PlayAI',
  });
}

