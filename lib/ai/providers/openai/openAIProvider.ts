// File: lib/ai/providers/openAIProvider.ts

import { BaseProvider } from "../baseProvider";
import OpenAI from 'openai'; // Assuming you're using the OpenAI npm package

export default class OpenAIProvider implements BaseProvider {
    private client: OpenAI;

    constructor() {
        this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }

    async sendMessage(message: string): Promise<string> {
        const response = await this.client.chat.completions.create({
            model: "gpt-4",
            messages: [{ role: "user", content: message }],
        });
        // MATRX-EXCEPTION: the OpenAI SDK types `message.content` as
        // `string | null` (null on tool-call-only responses); this method's
        // contract is `Promise<string>`, so "" is the honest normalization,
        // not a boundary failure being papered over.
        return response.choices[0].message.content || "";
    }
}
