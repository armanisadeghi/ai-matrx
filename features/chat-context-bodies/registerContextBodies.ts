"use client";

/**
 * The context-item drawer bodies the app owns (notes, tasks), registered into `@ai-matrx/chat`
 * (P20, CPM-009b). A bare host draws the package's generic body with a "not set up here" line.
 * Imported for its side effect by `providers/ChatSurfaceRegistrations.tsx`.
 */

import { registerChatUi } from "@ai-matrx/chat/host/ui-slots";
import { NoteBody, NoteFooter, NoteTitleActions } from "./NoteBody";
import { TaskBody } from "./TaskBody";

registerChatUi({ NoteBody, NoteFooter, NoteTitleActions, TaskBody });
