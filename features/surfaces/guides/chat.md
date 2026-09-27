# Chat — how to work on someone else's conversation

The page is **Chat** (`/chat/new`, `/chat/a/<agentId>`, `/chat/<conversationId>`, surface
`matrx-user/chat`). It shows one live conversation between the person and an agent, and a
composer for the person's next message. Read this once before your first write.

## You are an OUTSIDE agent

The person opened you from the Agents menu in a window, sidebar or overlay while this chat is
open. **You are not the agent in the conversation, and it is not your conversation.**

- Talk to the person in YOUR reply. Do not write your answer into their conversation.
- Nothing you do here appears in the conversation unless you use a write target, and every write
  target asks the person first on an approval card.
- The conversation's own agent never sees these tools. Only you do.

## What you can read (all up front, no lookups needed)

- `conversation`: the open conversation as one object:
  `{ id, title, agent_id, agent_name, model, status, is_streaming, message_count, older_messages_not_loaded }`.
  - `status` is the run status: `ready`, `running`, `streaming`, `complete`, `error` or `cancelled`.
  - `message_count` 0 means the conversation has not been saved yet.
  - `older_messages_not_loaded: true` means the page loaded only the newest messages.
    You can see and change only the loaded ones.
- `transcript`: every loaded message, oldest first:
  `{ id, role, text, created_at, tool_calls, streaming?, edited? }`.
  - `text` is the message as the page shows it. Your patches anchor against it.
  - `tool_calls` sit on the assistant message that made them, each
    `{ id, name, arguments_excerpt, status, result_excerpt }`. Both excerpts are the first
    300 characters on one line (cut with …). They tell you what was called and roughly what came
    back, not the whole payload.
  - `streaming: true` means the message is still being written and cannot be changed.
  - `edited: true` means someone already edited it.
- `input_draft`: what is in the composer now (unsent). It is absent when the composer is empty.
- The smaller values (`conversation_title`, `last_user_message`, `last_assistant_message`,
  `is_streaming`, `model`, `attached_resources`, `run_configuration`, …) repeat parts of the above
  for bindings. `all_messages` and `full_conversation_text` are older copies of the transcript.
  Do not look them up.

If the transcript is very long, the part past the first 10,000 characters arrives as a look-up
item. Read it once with the `context` tool, and only when you need those older messages.

## What you can change

Every target is `ask`: the person sees a card and approves or declines. A declined write is a
normal answer, not an error. Do not retry it.

### Edit past messages: `update_messages`

A list of edits, user or assistant messages, saved when approved:

```json
[
  { "message_id": "<assistant id>", "patch": { "old_str": "Paris is large.", "new_str": "Paris is the largest city in France." } },
  { "message_id": "<user id>", "text": "What is the capital of France, and why?" }
]
```

- Prefer `patch` for anything smaller than the whole message. `old_str` must appear **exactly
  once** in the message's current `text`. Copy it exactly, and include enough surrounding words to
  make it unique. `new_str: ""` deletes the matched text.
- Use `text` only to replace the whole message.
- Everything is checked before the card is shown. If anything is wrong (an unknown id, a streaming
  message, a missing or ambiguous `old_str`, a repeated id), the whole list is refused with every
  problem listed. Fix them all and send the list again.
- What an edit means:
  - The text changes for everyone who views the conversation. The old text is kept in the
    message's edit history.
  - The model sees an edited user message from the next turn on. It sees an edited assistant
    answer too, unless the organization turned off "The model sees edited answers".
  - Nothing is re-run and no turn is spent.
- The result names the edited ids.

### Remove messages: `delete_messages`

Send a list of ids, e.g. `["<id>", "<id>"]`.

- The messages disappear for everyone, together with their tool calls and what those produced.
- The model stops seeing them.
- There is no undo on the page.
- Prefer `update_messages` when the text only needs fixing.

### The composer: `input_draft` (nothing is sent)

- Replace the draft: `{ "text": "Can you compare Paris and Lyon?" }`.
- Add after it: `{ "text": "Also include population.", "mode": "append" }`.
- Fix part of it: `{ "patch": { "old_str": "Lyon", "new_str": "Marseille" } }`.
  This anchors against the current `input_draft` and is refused if the draft is empty.

The person still sends the message. **When the person wants to ask something new or rephrase
their next question, use the composer, not history.** Edit history only when they ask you to fix
or rewrite what was already said.

### Actions

| Target | Value | What happens |
|---|---|---|
| `send_draft` | `true` | Sends the composer's message, the same as pressing Send. **Spends a turn.** Refused when the draft is empty or a response is streaming. |
| `regenerate_last_answer` | `{ "message_id": "<latest assistant id>" }` | Archives the last answer and has the agent answer the same question again. **Spends a turn.** Only the latest answer can be regenerated. |
| `stop_response` | `true` | Stops a response being written now. What was written stays. Refused when nothing is running. |
| `fork_conversation` | `{ "message_id": "<id>" }` | Creates a new conversation with every message up to that one. The original is untouched, and the person is asked whether to open it. Returns the new id. |
| `conversation_title` | `"Trip planning: Paris"` | Renames the conversation (at most 200 characters). Refused before the first turn is saved. |

A typical "draft and send" is two writes, and the person approves each: `input_draft`, then
`send_draft`.

## Rules

- Never use generic context or scope tools to change this conversation's messages. Only these
  targets go through the page's own save functions.
- Do not edit or delete while `conversation.is_streaming` is true, except to `stop_response`.
- Your snapshot of the page was taken when your run started. After a write, trust the write's
  result, not the old `transcript`.
- When stuck (a target refuses in a way you cannot fix, or a value is missing or wrong), report it
  with `surface_feedback` and tell the person what you could not do.
