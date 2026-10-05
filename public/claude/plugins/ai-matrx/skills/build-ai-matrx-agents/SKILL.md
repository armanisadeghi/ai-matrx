---
name: build-ai-matrx-agents
description: Splits one big Claude task or automation into a set of focused AI Matrx agents that work on the person's own AI Matrx tables, then builds and test-runs each one. Use when the person says "split my task into agents", "turn my automation into AI Matrx agents", "make agents for my work", or after their data has moved into AI Matrx.
---

# Turn one big task into AI Matrx agents

The person has one large Claude task (a long prompt, a CLAUDE.md, a project instruction or a
scheduled job) that does many jobs at once. You split it into about a dozen focused AI Matrx
agents, each doing one job well on their AI Matrx data, owned by them in their organization.

## 1. Read what exists

1. Read their big task in full (ask where it lives if you do not have it).
2. `tables` `action: "list_tables"`, then `action: "columns"` on each table the task touches, so
   every agent is described in terms of their real tables and columns.
3. `agents` `action: "list"` — reuse an agent they already have rather than making a twin.

## 2. Propose the split

One agent per job a person would name on its own ("write next week's captions for a client",
"flag invoices more than 15 days overdue", "summarize a campaign's results for the client").
For each, write down — in plain words, never as a prompt:

- **Name** — Title Case, what it does ("Weekly Caption Writer").
- **Goal** — what it is for and what a good result looks like.
- **Inputs** — the variables each run is given (`client_name`, `week_of`, …), each with a description.
- **Output** — text, or a JSON shape when its result feeds a table or another agent.
- **Tables** — which tables it reads and which it changes.

Show the person the list as one short line per agent and ask once: **"Shall I build these?"**

## 3. Build and prove each one

For each agent:

```
agents action:"create" name:"Weekly Caption Writer" goals:"…" summary:"…"
       variables:[{"name":"client_name","description":"…"}] response_format:"text"
```

AI Matrx's Agent Builder writes the agent from the goal (a minute or two each); agents get the
tools to read and change the person's tables by default. Then run it once on real data:

```
agents action:"run" agent_id:"…" values:{"client_name":"Fernwood Bakery"}
```

Check the output against the goal. If it misses, say what was missing and rebuild by calling
`create` again with a clearer goal (never write its prompt yourself).

## 4. Hand over

Give the person: each agent's name, one line on what it does, and the result of its test run.
Tell them where they live: AI Matrx → Agents. Note anything the old big task did that no agent
covers yet.
