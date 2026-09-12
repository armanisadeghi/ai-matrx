# `/code` workspace — end-to-end QA checklist

This is the gate that takes the workspace from "wired" to "verified". Run
the steps below against the **hosted orchestrator tier** in the order
listed. Each step has a one-line pass criterion in *italics*. If a step
fails, file an issue with the step number and the captured logs.

> Tip: keep the browser devtools console open the whole time. Several
> steps surface useful diagnostics there even when the UI looks happy.

| # | Area | Step |
|---|------|------|
| 0 | Setup | Sign in as a user with sandbox quota; ensure no leftover sandboxes are running. |

## 1 — Create a hosted-tier sandbox via the picker

1. Open the workspace at `/code`.
2. From the activity bar, select **Sandboxes** and click **New sandbox**.
3. Pick tier **Hosted**, template **default** (or any base template), accept default resources, click **Create**.

*Pass when the sandbox row appears in the list and reaches `status: ready` within ~60s. The "last used tier" preference should persist after refresh.*

## 2 — Connect, write a file, watch the tree update

1. Click **Connect** on the new sandbox row.
2. Open the **Explorer** activity view; the file tree should populate from `/home/agent`.
3. Right-click the root → **New file** → name it `hello.ts` and add `console.log("hi")`.
4. Save (`Cmd+S`).

*Pass when (a) the new file appears in the tree without a manual refresh (driven by `useTabRealtimeWatcher` in the orchestrator's `filesystem.watch` channel) and (b) re-opening the file shows your saved content.*

## 3 — Source control: clone, diff, commit, push

1. In a terminal tab, run `git clone https://github.com/<some-small-public-repo>.git demo` (or `git init && git remote add origin <test-repo>`).
2. Open the **Source Control** activity view, point it at `/home/agent/demo`.
3. Edit a file in the editor; the file appears under **Unstaged**.
4. Click the file to open the diff in a `git-diff:` editor tab.
5. Click **Stage**, type a commit message, click **Commit**.
6. Open the **Credentials** modal and paste a short-lived test PAT.
7. Click **Push**.

*Pass when the push reports success and `git log -1` (in the terminal) shows your commit on `origin/<branch>`.*

## 4 — Server-side ripgrep search

1. Open the **Search** activity view.
2. Search for a literal token you know exists across multiple files in the cloned repo.

*Pass when results stream in via the orchestrator (look for `searchContent` in network tab, not a client-side directory walk) and clicking a result opens the file at the matched line.*

## 5 — Streaming exec from the terminal

1. In the terminal panel, run `pnpm install` (or any long command — `seq 1 50000 | head -n 1000` works in a pinch).
2. While output is streaming, hit `Ctrl-C`.

*Pass when output appears progressively (not in a single dump at the end) and `Ctrl-C` cancels the process within ~1s.*

## 6 — Interactive PTY (vim, top, mid-stream signals)

1. In the same terminal panel, run `vim hello.ts`.
2. Type a few characters, save with `:wq`, watch the editor tab refresh via the live tree watcher.
3. Run `top`, let it tick, then quit with `q`.

*Pass when vim renders normally (full-screen redraw, colors, cursor positioning) and `top` updates in place — both signal a real PTY rather than buffered exec.*

## 7 — Library tab: prompt-app type env + save back to row

1. Open **Library → Prompt apps**, pick any row, open the inline component column.
2. Confirm the editor status bar shows the **prompt-app** type environment label.
3. Add a stray `import { Button } from "@/components/ui/button"` line — confirm there's *no* Monaco diagnostic for the import (the env's ambient .d.ts covers it).
4. Save (`Cmd+S`).
5. Cross-check the `prompt_apps.component_code` cell in Supabase Studio.

*Pass when (a) no false-positive type errors appear, (b) the toolbar's "Saved Xs ago" indicator shows up immediately after save, and (c) Supabase Studio reflects the new content with an updated `updated_at`.*

## 8 — Conflict toast: reload + overwrite

1. Keep the same prompt-app tab open and dirty (type a few characters but do NOT save).
2. In Supabase Studio, edit the same row's `component_code` to a different value, save.
3. Watch the workspace; the realtime watcher fires a soft warning toast.
4. Hit `Cmd+S` in the editor.
5. The conflict toast appears with **Reload** and **Overwrite** actions.
6. Click **Reload** — verify the editor's buffer is replaced with the Studio version, and the local edits land in the clipboard.
7. Re-dirty the tab, save, click **Overwrite** this time — verify the row in Studio gets your local version and the toolbar's "Saved" indicator updates.

*Pass when both branches behave as described and no console errors are logged.*

## 9 — Editor → agent context bridge

1. Open three editor tabs (mix of filesystem and library tabs).
2. Open the chat panel; confirm the **Context chip** in the chat header shows `3/3`.
3. Toggle one tab off in the chip's popover; confirm the chip updates to `2/3` and the disabled tab persists across refresh (stored in `instanceUIState.editorContextDisabledTabs`).
4. In an agent that supports `ctx_get`, send a message asking it to read `editor.tab.<id>` for one of the open tabs.
5. Select a range in the editor, click the **Send selection as context** toolbar button (`Cmd+Shift+L`).
6. Ask the agent for `editor.selection.<id>`.

*Pass when the agent receives both the buffer content and the selection content (visible in the request payload via devtools, or the agent's response if it echoes the context).*

## 10 — Heartbeat keeps the sandbox alive

1. Leave the workspace open and idle for 30 minutes (no edits, no terminal input). The chat panel and editor stay mounted.
2. After 30 minutes, run any sandbox command (e.g. `ls /home/agent`).

*Pass when the command succeeds — the orchestrator's idle-shutdown sweep should not have reaped the sandbox because `useSandboxHeartbeat` was pinging in the background.*

## 11 — Confirmed image update from an attached workspace

1. Keep the Explorer file watcher and an idle PTY open on a hosted sandbox whose image is outdated.
2. Create a persistent sentinel file under `/home/agent` and note the sandbox ID.
3. Choose **Update image**, read the interruption warning, and confirm.
4. After completion, re-read the sentinel and run a harmless command in the recreated PTY.
5. Repeat while a sandbox tool call is executing.

*Pass when the idle attached workspace migrates under the same sandbox ID, preserves the sentinel, and reconnects. The executing-tool case must return a specific informational `busy_deferred` result with no container change and no red Error Inspector entry. Any genuine failure must produce one structured API error containing HTTP status, machine status/reason, and the upstream payload.*

---

## Final type / lint pass

After the manual smoke run, finish with:

```bash
NODE_OPTIONS="--max-old-space-size=8192" pnpm tsc --noEmit
pnpm lint
```

Both must complete with zero errors before the workspace is considered "fully done".
