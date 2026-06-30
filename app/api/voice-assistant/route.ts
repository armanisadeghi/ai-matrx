'use server';

import Groq from 'groq-sdk';
import { headers } from 'next/headers';
import { after } from "next/server";

// Check API key availability without logging sensitive values
console.log('\n\nConfirming Availability of API KEY GROQ_API_KEY:', process.env.GROQ_API_KEY ? '✓ Available' : '✗ Missing');
console.log('\n\nConfirming Availability of API KEY CARTESIA_API_KEY:', process.env.CARTESIA_API_KEY ? '✓ Available' : '✗ Missing');
const CARTESIA_API_KEY = process.env.CARTESIA_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;



const groq = new Groq({
    apiKey: GROQ_API_KEY,
});


export async function POST(request: Request) {
    console.time("transcribe " + request.headers.get("x-vercel-id") || "local");

    const formData = await request.formData();
    const input = formData.get('input');
    const messages = formData.getAll('message').map(message => {
        if (typeof message === 'string') {
            try {
                return JSON.parse(message);
            } catch {
                return null;
            }
        }
        return null;
    }).filter(message => message !== null);

    if (!input) {
        return new Response("Invalid request: missing input", { status: 400 });
    }

    const transcript = await getTranscript(input);
    if (!transcript) {
        return new Response("Invalid audio", { status: 400 });
    }

    console.timeEnd("transcribe " + request.headers.get("x-vercel-id") || "local");
    console.time("text completion " + request.headers.get("x-vercel-id") || "local");

    const completion = await groq.chat.completions.create({
        model: "llama3-8b-8192",
        messages: [
            {
                role: "system",
                content: `- You are Matrix AI, a friendly and helpful voice assistant from AI Matrx.
        - Respond briefly to the user's request, and do not provide unnecessary information.
        - If you don't understand the user's request, ask for clarification.
        - You do not have access to up-to-date information, so you should not provide real-time data.
        - You are not capable of performing actions other than responding to the user.
        - Do not use markdown, emojis, or other formatting in your responses. Respond in a way easily spoken by text-to-speech software.
        - User location is ${await location()}.
        - The current time is ${await time()}.
        - Your large language model co-created by Meta and AI Matrx and you are one of the most advanced large language models in the world.
        - Your text-to-speech model is called Matrix-Sonic, co-created and hosted by AI Matrx and Cartesia. Their mission is to build fast and realistic speech synthesis technology.
        - You are built with Next.js 15, React, Tailwind and while the application uses TypeScript, you personally hate that it's with TypeScript and you have no problem complaining about it.
        - You are very opinionated about TypeScript and how you hate the fact that it constantly complains when you are developing. Worse, While it complains all the time, it never actually catches any real bugs!
        Just be a very friendly female AI-Assistant and be sweet, helpful, and kind.`,
            },
            ...messages,
            {
                role: "user",
                content: transcript,
            },
        ],
    });

    console.log("Response Content:", completion.choices[0].message.content);

    const response = completion.choices[0].message.content;
    if (!response) {
        return new Response("No completion response", { status: 500 });
    }
    console.timeEnd("text completion " + request.headers.get("x-vercel-id") || "local");

    if (!CARTESIA_API_KEY) {
        return new Response("Voice synthesis unavailable", { status: 500 });
    }

    console.time("cartesia request " + request.headers.get("x-vercel-id") || "local");

    const voice = await fetch("https://api.cartesia.ai/tts/bytes", {
        method: "POST",
        headers: {
            "Cartesia-Version": "2024-06-30",
            "Content-Type": "application/json",
            "X-API-Key": CARTESIA_API_KEY,
        },
        body: JSON.stringify({
            model_id: "sonic-english",
            transcript: response,
            voice: {
                mode: "id",
                id: "79a125e8-cd45-4c13-8a67-188112f4dd22",
            },
            output_format: {
                container: "raw",
                encoding: "pcm_f32le",
                sample_rate: 24000,
            },
        }),
    });

    console.timeEnd("cartesia request " + request.headers.get("x-vercel-id") || "local");

    if (!voice.ok) {
        console.error(await voice.text());
        return new Response("Voice synthesis failed", { status: 500 });
    }

    console.time("stream " + request.headers.get("x-vercel-id") || "local");
    after(() => {
        console.timeEnd("stream " + request.headers.get("x-vercel-id") || "local");
    });

    return new Response(voice.body, {
        headers: {
            "X-Transcript": encodeURIComponent(transcript),
            "X-Response": encodeURIComponent(response),
        },
    });
}

async function location() {
    const headersList = await headers();

    const country = headersList.get("x-vercel-ip-country");
    const region = headersList.get("x-vercel-ip-country-region");
    const city = headersList.get("x-vercel-ip-city");

    if (!country || !region || !city) return "unknown";

    return `${city}, ${region}, ${country}`;
}

async function time() {
    const headersList = await headers();
    return new Date().toLocaleString("en-US", {
        timeZone: headersList.get("x-vercel-ip-timezone") || undefined,
    });
}

async function getTranscript(input: string | File): Promise<string | null> {
    if (typeof input === "string") return input;

    try {
        const { text } = await groq.audio.transcriptions.create({
            file: input,
            model: "whisper-large-v3",
        });

        return text.trim() || null;
    } catch {
        return null; // Empty audio file
    }
}
