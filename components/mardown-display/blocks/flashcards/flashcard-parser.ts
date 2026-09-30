/**
 * Parser for flashcard content
 * Handles both "Front/Back" and "Question/Answer" formats
 * Supports optional thematic breaks (---)
 *
 * Optional set title: a `Title: <name>` line BEFORE the first card names the
 * set ("Title: Polyatomic Ions"). The format had no title slot, so every set
 * written in it was named by the platform's placeholder — see
 * features/flashcards/utils/deckName.ts. Mirrored by the server port
 * (aidream packages/matrx-ai .../parsers/flashcard_parser.py).
 */

export interface Flashcard {
    front: string;
    back: string;
    /** Optional face images (durable URLs — fc_detail front_image/back_image).
     *  Parsed markdown never sets these; DB-backed callers may. Print + rich
     *  renderers consume them when present. */
    frontImageUrl?: string | null;
    frontImageAlt?: string | null;
    backImageUrl?: string | null;
    backImageAlt?: string | null;
}

export interface FlashcardParseResult {
    flashcards: Flashcard[];
    isComplete: boolean;
    partialCard: Partial<Flashcard> | null;
    /** The set's own `Title:` line, or null when the text carries none. */
    title: string | null;
}

/**
 * Parse flashcard content into individual cards
 * Only returns complete flashcards (both front and back present)
 * 
 * Supports both single-line and multi-line Back/Answer content:
 *   Back: single line answer
 *   Back: 
 *   - bullet one
 *   - bullet two
 */
export const parseFlashcards = (content: string): FlashcardParseResult => {
    const flashcards: Flashcard[] = [];
    let currentCard: Partial<Flashcard> = {};
    let partialCard: Partial<Flashcard> | null = null;
    let isComplete = false;
    let collectingBack = false;
    let backLines: string[] = [];
    let title: string | null = null;
    let sawCard = false;

    isComplete = content.includes('</flashcards>');

    // `</flashcards>` is the COMPLETION SENTINEL (read above), never content.
    // The host region text carries the literal tags (and the fence surface
    // re-appends the closing tag as its sentinel), so without stripping them
    // the tag line falls through to `backLines.push(line)` while collecting a
    // back — gluing "</flashcards>" onto the LAST card's answer text. Strip the
    // framing tags before parsing so they can never leak into a card.
    const lines = content
        .replace(/<flashcards(?:\s[^>]*)?>/gi, '')
        .replace(/<\/flashcards>/gi, '')
        .split('\n');

    const finalizeCard = () => {
        if (collectingBack && backLines.length > 0) {
            currentCard.back = backLines.join('\n').trim();
            collectingBack = false;
            backLines = [];
        }
        if (currentCard.front && currentCard.back) {
            flashcards.push({
                front: currentCard.front,
                back: currentCard.back,
            });
            currentCard = {};
        }
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        if (line === '---') {
            finalizeCard();
            continue;
        }

        // The set title is only a title BEFORE the first card; afterwards a
        // "Title:" line is card text like any other.
        if (!sawCard && title === null) {
            const titleMatch = line.match(/^Title:\s*(.+)/i);
            if (titleMatch) {
                title = titleMatch[1].trim() || null;
                continue;
            }
        }

        const frontMatch = line.match(/^(?:Front|Question):\s*(.*)/i);
        if (frontMatch) {
            sawCard = true;
            finalizeCard();
            currentCard.front = frontMatch[1].trim();
            collectingBack = false;
            backLines = [];
            continue;
        }

        const backMatch = line.match(/^(?:Back|Answer):\s*(.*)/i);
        if (backMatch) {
            collectingBack = true;
            backLines = [];
            const inlineContent = backMatch[1].trim();
            if (inlineContent) {
                backLines.push(inlineContent);
            }
            continue;
        }

        if (collectingBack) {
            if (line === '') {
                // Blank lines within back content are preserved
                backLines.push('');
            } else {
                backLines.push(line);
            }
            continue;
        }

        // Continuation of front text (no Back: seen yet for this card)
        if (currentCard.front && !currentCard.back && line) {
            currentCard.front += ' ' + line;
        }
    }

    // Finalize any in-progress back collection
    if (collectingBack && backLines.length > 0) {
        currentCard.back = backLines.join('\n').trim();
        collectingBack = false;
        backLines = [];
    }

    // Handle the last card
    if (currentCard.front && currentCard.back) {
        if (isComplete) {
            flashcards.push({
                front: currentCard.front,
                back: currentCard.back,
            });
            partialCard = null;
        } else {
            partialCard = currentCard;
        }
    } else if (currentCard.front || currentCard.back) {
        partialCard = currentCard;
    }

    return {
        flashcards,
        isComplete,
        partialCard,
        title,
    };
};

