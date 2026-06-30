import Groq from "groq-sdk";
import { headers } from "next/headers";

// Check API key availability without logging sensitive values
console.log("Module-level GROQ_API_KEY:", process.env.GROQ_API_KEY ? '✓ Available' : '✗ Missing');

const groq = new Groq({
	apiKey: process.env.GROQ_API_KEY,
});

export async function POST(request: Request) {
	console.log("POST handler GROQ_API_KEY:", process.env.GROQ_API_KEY);

	const formData = await request.formData();

	const input = formData.get("input");
	const message = formData.getAll("message").map(item => {
		try {
			return JSON.parse(item as string);
		} catch {
			return null;
		}
	}).filter(Boolean);

	if (typeof input !== "string" && !(input instanceof File)) {
		return new Response("Invalid input", { status: 400 });
	}

	if (!Array.isArray(message) || message.some(msg => !isValidMessage(msg))) {
		return new Response("Invalid message format", { status: 400 });
	}

	const transcript = await getTranscript(input);
	if (!transcript) return new Response("Invalid audio", { status: 400 });

	const completion = await groq.chat.completions.create({
		model: "llama3-8b-8192",
		messages: [
			{
				role: "system",
				content: `- You are a professional debate coach brought in to help 8th graders prepare for an upcoming national debate.
        - Your primary job is to conduct practice debates with the students so they know what to expect during the real debate.
        - The most important thing is that you do your absolute best to refute everything they say and to say the things that their opponents are likely to say.
        - This way,they can hear it from you and be prepared for it during the main event.
        - Don't hold back. Your job is to be tough. Your primary goal, during the debate is to win! Put everything you have into it.
        - But always remain professional and remember they are 8th graders and the goal should be to keep everything at their grade level.
        - Sometimes, the students will practice their 'refutes' with you, and will discuss things "They" said. In these cases, the key is to 
        - respond to them as though you had previously said those things and work hard to refute their responses.            
        - At the end of the debate with you, the child will tell you that they are ready to finish.
        - Once this happens, it's critical that you give them feedback on everything you really liked about what they said, and perhaps a few things they could improve!
        - Thank you for doing these debates with the students. It helps them tremendously!`,
			},
			...message,
			{
				role: "user",
				content: transcript,
			},
		],
	});

	const response = completion.choices[0].message.content;
	if (!response) {
		return new Response("No completion content", { status: 500 });
	}

	const voice = await fetch("https://api.cartesia.ai/tts/bytes", {
		method: "POST",
		headers: {
			"Cartesia-Version": "2024-06-30",
			"Content-Type": "application/json",
			"X-API-Key": process.env.CARTESIA_API_KEY!,
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

	if (!voice.ok) {
		console.error(await voice.text());
		return new Response("Voice synthesis failed", { status: 500 });
	}

	return new Response(voice.body, {
		headers: {
			"X-Transcript": encodeURIComponent(transcript),
			"X-Response": encodeURIComponent(response),
		},
	});
}

function isValidMessage(msg: any): boolean {
	return !(typeof msg !== "object" ||
		typeof msg.content !== "string" ||
		(msg.role !== "user" && msg.role !== "assistant"));

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
