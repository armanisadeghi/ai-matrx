import { NextResponse } from 'next/server';
import { bulkCreateCxMessages, createCxMessage } from '@ai-matrx/chat/public-chat/services/cx-chat';
import type { CxMessageInsert } from '@ai-matrx/chat/public-chat/types/cx-tables';

/**
 * POST /api/cx-chat/messages
 *
 * Save messages for a conversation. Supports single or bulk insert.
 * Body: { messages: CxMessageInsert[] } or { message: CxMessageInsert }
 */
export async function POST(request: Request) {
    try {
        const body = await request.json();

        if (body.messages && Array.isArray(body.messages)) {
            const messages = body.messages as CxMessageInsert[];
            if (messages.length === 0) {
                return NextResponse.json({ success: true, data: [] });
            }
            const created = await bulkCreateCxMessages(messages);
            return NextResponse.json({ success: true, data: created }, { status: 201 });
        }

        if (body.message) {
            const message = body.message as CxMessageInsert;
            const created = await createCxMessage(message);
            if (!created) {
                return NextResponse.json(
                    { success: false, error: 'Failed to create message' },
                    { status: 500 },
                );
            }
            return NextResponse.json({ success: true, data: created }, { status: 201 });
        }

        return NextResponse.json(
            { success: false, error: 'Provide either messages (array) or message (object)' },
            { status: 400 },
        );
    } catch (error) {
        console.error('POST /api/cx-chat/messages error:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to save messages' },
            { status: 500 },
        );
    }
}
