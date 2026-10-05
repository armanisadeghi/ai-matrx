---
name: migrate-notion-to-ai-matrx
description: Copies a person's whole Notion workspace into AI Matrx — every database becomes a table with typed columns, relations, roll-ups, files, page bodies and views — safely re-runnable and resumable. Use when the person says "copy my Notion into AI Matrx", "move my Notion over", "import my Notion", or hands you a Notion export zip.
---

# Copy a Notion workspace into AI Matrx

The AI Matrx connector carries the full recipe. Call its `how_to` tool with `topic: "notion"`
and follow it exactly: one plain question to the person (the plan), then move every database,
row, link, file, page body, comment, template and view, and finish with a count per table.

If AI Matrx or Notion is not connected in this AI, tell the person in one sentence to connect it
in this AI's connector settings (they click Connect and sign in — no keys), then continue.

For a Notion export zip instead of the Notion connector, `scripts/import_notion_export.py` does
the same job from the zip (`plan`, then `run`).
