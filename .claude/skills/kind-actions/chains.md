---
type: Reference
title: "kind-actions — chains and generated images"
description: "How a shape runs two or more shortcuts in order (idea → image prompt → image) and shows a generated image on the item. Companion to the kind-actions skill."
tags: [kind-actions, skills, shapes, images]
timestamp: 2026-10-06T00:00:00Z
---

# Chains and generated images

## A chain is awaited calls, each saved

There is no "workflow" to build for a two- or three-step job on one item. The component
awaits `run_shortcut` once per step, saves every step with `saveAs`, and feeds each step's
product into the next step's `scope`. Every step is visible in the live-run window while it
works, and every saved step survives a reload — so a chain that fails at step 2 keeps step 1
and can resume from it.

```tsx
// Platform shortcuts over built-in agents (public, every organization can run them):
const IMAGE_PROMPT_SHORTCUT = "c70e1694-9b84-4843-9999-cb5471478bb4"; // "Image Prompt from an Idea" → text
const IMAGE_SHORTCUT = "a415f9f8-aa62-45f9-a532-5987da03ee59";        // "Generate an Image" → image

async function visualize(idea, runAction) {
  const key = `idea_${idea.number}`;
  const prompt = await runAction("run_shortcut", {
    shortcutId: IMAGE_PROMPT_SHORTCUT,
    scope: { selection: ideaText(idea) },
    expect: "text",
    saveAs: `${key}_prompt`,
    label: "Writing the image prompt",
  });
  if (!prompt.ok) return prompt;
  return runAction("run_shortcut", {
    shortcutId: IMAGE_SHORTCUT,
    scope: { selection: imagePromptOf(prompt.result.data) },
    expect: "image",
    saveAs: `${key}_image`,
    label: "Generating the image",
  });
}
```

- `ideaText(idea)` — a short markdown rendering of the one piece (title, scene, mood, format,
  overlay text, brand line). Text the agent can read, never the raw object.
- `imagePromptOf(text)` — the prompt writer may wrap its prompt in `<image_prompt>…</image_prompt>`
  and add a sentence after it; take the tag's contents when present, else the whole text.
- Start the chain from ONE button: `<KindActionButton run={() => visualize(idea, runAction)}
  label="Image" confirm="Writes an image prompt, then generates an image. Uses credits." />` —
  `run` replaces `action`+`input` and gets the same busy state, confirm and error line.
  Re-running replaces both saved values.
- Show progress honestly: while `itemState[key + "_prompt"]` exists and `_image` does not, the
  card says the image is on its way (the live window shows the stream).

## Showing a generated image

`expect: "image"` returns — and `saveAs` stores — the image by durable identity:

```json
{ "file_id": "…", "mime_type": "image/png", "width": 1024, "height": 1536, "organization_id": "…" }
```

When the host hands `itemState` back to the component it adds `src` to every saved image ref
(nested up to three levels): a `blob:` URL the component can put straight into `<img>`. The
host fetched the bytes with the reader's own authorization; the component never builds a URL
from a `file_id` (it cannot reach the file server).

```tsx
const image = itemState[`idea_${idea.number}_image`];
{image?.src && <img src={image.src} alt={idea.title} className="w-full rounded-md" />}
{image && !image.src && !image.src_error && <Skeleton className="aspect-[4/5] w-full" />}
{image?.src_error && <p className="text-xs text-muted-foreground">{image.src_error}</p>}
```

- `src` is `null` while the bytes load; `src_error` carries a sentence when they could not.
- Never save a `src`, a `url` or a download link — only the ref. Links are derived at render
  time from `file_id`.
- An image model's answer is a media block, not text: `expect: "text"` on an image shortcut
  returns nothing usable. Always `expect: "image"`.
