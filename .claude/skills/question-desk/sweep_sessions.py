#!/usr/bin/env python3
"""Find recent local Claude Code chats that ended on a question for the owner.

Part of the `question-desk` skill. Three sources, merged and de-duplicated by
session id, most useful first:

  1. The Stop-hook inbox written by `question_capture_hook.py`
     (~/.claude/question-desk/inbox.jsonl) — exact, cheap, only present once
     the hook is installed (see setup.md).
  2. `claude agents --json --all` — the CLI's own structured session list
     (state, status, name, cwd) when the CLI is on PATH.
  3. A scan of ~/.claude/projects/<project>/<session>.jsonl transcripts
     modified inside --since. The entry format is internal to Claude Code and
     may change between versions; this reader is defensive, and a transcript
     that yields no readable record is reported LOUDLY, never skipped quietly.

Subagent transcripts (<session>/subagents/*.jsonl) are never scanned — a
subagent's question goes to its owner session, not to Arman.

Usage
  python3 sweep_sessions.py                      # table of candidates, last 3 days
  python3 sweep_sessions.py --since 7d --json    # machine-readable
  python3 sweep_sessions.py --show <session-id>  # the full last assistant message
  python3 sweep_sessions.py --ledger <path>      # mark sessions already filed in the ledger
  python3 sweep_sessions.py --self-test          # prove the detector can fail, then pass

Exit 0 always except --self-test failure (exit 1) and an unreadable root (exit 2).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass, field, asdict
from pathlib import Path

CONFIG_DIR = Path(os.environ.get("CLAUDE_CONFIG_DIR", str(Path.home() / ".claude")))
PROJECTS_DIR = CONFIG_DIR / "projects"
INBOX = CONFIG_DIR / "question-desk" / "inbox.jsonl"

# Phrases that mark a sentence as addressed to the owner for a decision.
ASK_PHRASES = re.compile(
    r"\b(your call|which (?:do|would) you|do you want|should i|should we|let me know|"
    r"please confirm|can you confirm|reply with|say \"?(?:yes|go|a|b)\"?|"
    r"i need (?:you|your)|waiting on you|need(?:s)? (?:a|your) (?:decision|ruling|answer|approval)|"
    r"open[- ]ended|recommendation:|rec:)",
    re.IGNORECASE,
)
NUMBERED_Q = re.compile(r"^\s*(?:\*\*)?(?:Q\s?\d+|\d+[.)])\s*(?:[—-]\s*)?[^\n]*\?", re.MULTILINE)
CODE_FENCE = re.compile(r"```.*?```", re.DOTALL)


@dataclass
class Candidate:
    session_id: str
    cwd: str = ""
    title: str = ""
    branch: str = ""
    last_at: str = ""
    ended_on_assistant: bool = False
    state: str = ""  # from `claude agents --json` when available
    score: int = 0
    reasons: list[str] = field(default_factory=list)
    tail: str = ""
    sources: list[str] = field(default_factory=list)
    filed: bool = False
    transcript: str = ""


# ---------------------------------------------------------------- detection

def question_score(text: str) -> tuple[int, list[str]]:
    """Score how strongly a message reads as a question for the owner."""
    body = CODE_FENCE.sub("", text or "").strip()
    if not body:
        return 0, []
    score, reasons = 0, []
    lines = [ln.strip() for ln in body.splitlines() if ln.strip()]
    if lines and lines[-1].endswith("?"):
        score += 3
        reasons.append("ends with a question")
    n_numbered = len(NUMBERED_Q.findall(body))
    if n_numbered:
        score += 2 + min(n_numbered, 3)
        reasons.append(f"{n_numbered} numbered question(s)")
    q_lines = sum(1 for ln in lines if "?" in ln)
    if q_lines and not n_numbered:
        score += min(q_lines, 3)
        reasons.append(f"{q_lines} line(s) containing ?")
    if ASK_PHRASES.search(body):
        score += 2
        reasons.append("asks the owner directly")
    return score, reasons


# ---------------------------------------------------------------- transcripts

def _text_of(message: dict) -> str:
    content = message.get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(
            b.get("text", "") for b in content if isinstance(b, dict) and b.get("type") == "text"
        )
    return ""


def read_transcript(path: Path) -> Candidate | None:
    """Best-effort read of one top-level session transcript."""
    cand = Candidate(session_id=path.stem, transcript=str(path))
    records = 0
    last_role = None
    tail_parts: list[str] = []
    with path.open("rb") as fh:
        for raw in fh:
            try:
                rec = json.loads(raw)
            except Exception:
                continue
            if not isinstance(rec, dict):
                continue
            records += 1
            rtype = rec.get("type")
            msg = rec.get("message") if isinstance(rec.get("message"), dict) else None
            if rec.get("isSidechain"):
                continue
            if rec.get("cwd") and not cand.cwd:
                cand.cwd = rec["cwd"]
            if rec.get("gitBranch") and not cand.branch:
                cand.branch = rec["gitBranch"]
            if rec.get("timestamp"):
                cand.last_at = rec["timestamp"]
            if rtype == "user" and msg:
                text = _text_of(msg)
                if text and not text.startswith("<") and not cand.title:
                    cand.title = " ".join(text.split())[:100]
                if text:  # a real prompt, not a tool result
                    last_role = "user"
                    tail_parts = []
            elif rtype == "assistant" and msg:
                text = _text_of(msg)
                if text:
                    tail_parts.append(text)
                last_role = "assistant"
    if records == 0:
        print(f"[sweep] LOUD: no readable record in {path} — transcript format changed?", file=sys.stderr)
        return None
    cand.ended_on_assistant = last_role == "assistant"
    cand.tail = "\n".join(tail_parts)[-4000:]
    return cand


def scan_transcripts(since_s: float) -> list[Candidate]:
    out: list[Candidate] = []
    if not PROJECTS_DIR.is_dir():
        return out
    cutoff = time.time() - since_s
    for project in PROJECTS_DIR.iterdir():
        if not project.is_dir():
            continue
        for path in project.glob("*.jsonl"):  # top level only: never <session>/subagents/
            try:
                if path.stat().st_mtime < cutoff:
                    continue
            except OSError:
                continue
            cand = read_transcript(path)
            if cand:
                cand.sources.append("transcript")
                out.append(cand)
    return out


# ---------------------------------------------------------------- other sources

def read_inbox(since_s: float) -> dict[str, dict]:
    rows: dict[str, dict] = {}
    if not INBOX.is_file():
        return rows
    cutoff = time.time() - since_s
    for raw in INBOX.read_text(errors="replace").splitlines():
        try:
            rec = json.loads(raw)
        except Exception:
            continue
        if not isinstance(rec, dict) or not rec.get("session_id"):
            continue
        if float(rec.get("ts", 0)) < cutoff:
            continue
        rows[rec["session_id"]] = rec  # last write wins
    return rows


def read_agents_cli() -> dict[str, dict]:
    rows: dict[str, dict] = {}
    try:
        proc = subprocess.run(
            ["claude", "agents", "--json", "--all"], capture_output=True, text=True, timeout=20
        )
    except Exception as exc:  # CLI absent, or old version
        print(f"[sweep] note: `claude agents --json --all` unavailable ({exc.__class__.__name__})", file=sys.stderr)
        return rows
    if proc.returncode != 0:
        print(f"[sweep] note: `claude agents` exited {proc.returncode}: {proc.stderr.strip()[:200]}", file=sys.stderr)
        return rows
    try:
        data = json.loads(proc.stdout or "[]")
    except Exception:
        print("[sweep] LOUD: `claude agents --json` printed non-JSON — CLI format changed?", file=sys.stderr)
        return rows
    items = data if isinstance(data, list) else data.get("sessions", []) if isinstance(data, dict) else []
    for item in items:
        if isinstance(item, dict) and item.get("sessionId"):
            rows[item["sessionId"]] = item
    return rows


def parse_since(value: str) -> float:
    m = re.fullmatch(r"(\d+)([hdw])", value.strip())
    if not m:
        raise SystemExit(f"--since wants Nh / Nd / Nw, got {value!r}")
    n, unit = int(m.group(1)), m.group(2)
    return n * {"h": 3600, "d": 86400, "w": 604800}[unit]


# ---------------------------------------------------------------- main

def gather(since_s: float, ledger: Path | None, use_cli: bool = True) -> list[Candidate]:
    by_id: dict[str, Candidate] = {}
    for cand in scan_transcripts(since_s):
        by_id[cand.session_id] = cand
    for sid, rec in read_inbox(since_s).items():
        cand = by_id.get(sid) or Candidate(session_id=sid)
        cand.sources.append("hook-inbox")
        cand.cwd = cand.cwd or rec.get("cwd", "")
        cand.tail = cand.tail or rec.get("last_msg", "")
        cand.transcript = cand.transcript or rec.get("transcript_path", "")
        cand.ended_on_assistant = True
        by_id[sid] = cand
    if use_cli:
        for sid, rec in read_agents_cli().items():
            cand = by_id.get(sid)
            if not cand:
                continue
            cand.sources.append("agents-cli")
            cand.state = f"{rec.get('state', '')}/{rec.get('status', '')}".strip("/")
            cand.title = rec.get("name") or cand.title
            cand.cwd = cand.cwd or rec.get("cwd", "")
    ledger_text = ledger.read_text(errors="replace") if ledger and ledger.is_file() else ""
    out: list[Candidate] = []
    for cand in by_id.values():
        cand.score, cand.reasons = question_score(cand.tail)
        if not cand.ended_on_assistant:
            cand.score = 0
            cand.reasons = ["turn did not end on the assistant"]
        cand.filed = bool(ledger_text) and cand.session_id in ledger_text
        if cand.score > 0:
            out.append(cand)
    out.sort(key=lambda c: (-c.score, c.last_at), reverse=False)
    return out


def print_table(cands: list[Candidate]) -> None:
    if not cands:
        print("No recent chat ended on a question for the owner.")
        return
    print(f"{'score':>5}  {'filed':5}  {'when':20}  {'session':36}  title / cwd")
    for c in cands:
        title = (c.title or "(untitled)")[:70]
        print(f"{c.score:>5}  {'yes' if c.filed else 'no':5}  {c.last_at[:19]:20}  {c.session_id:36}  {title}")
        print(f"{'':5}  {'':5}  {'':20}  {'':36}  {c.cwd}  [{', '.join(c.sources)}]  {'; '.join(c.reasons)}")
    print("\nNext: `--show <session>` to read a tail; file each real question as a ledger row "
          "(ask-arman shape) carrying its session id.")


def self_test() -> int:
    """Prove the detector can fail, then pass, on the real record shape (observed 2026-09-12, CLI 2.1.269)."""
    sid_q, sid_n = "11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"

    def rec(rtype, text, sid):
        return json.dumps({
            "type": rtype, "sessionId": sid, "cwd": "/tmp/repo", "gitBranch": "main",
            "timestamp": "2026-09-12T10:00:00.000Z", "isSidechain": False,
            "message": {"role": rtype, "content": [{"type": "text", "text": text}]},
        })

    with tempfile.TemporaryDirectory() as tmp:
        global PROJECTS_DIR
        saved = PROJECTS_DIR
        PROJECTS_DIR = Path(tmp) / "projects"
        proj = PROJECTS_DIR / "-tmp-repo"
        (proj / sid_q / "subagents").mkdir(parents=True)
        (proj / f"{sid_q}.jsonl").write_text("\n".join([
            rec("user", "Build the guest record view", sid_q),
            rec("assistant", "Done with the build.\n\n1. Should a guest keep reading the meeting record after it ends? Rec: yes.", sid_q),
        ]))
        # a subagent transcript with a question must NOT surface
        (proj / sid_q / "subagents" / "agent-x.jsonl").write_text(rec("assistant", "Which one?", "agent-x"))
        (proj / f"{sid_n}.jsonl").write_text("\n".join([
            rec("user", "Fix the lint", sid_n),
            rec("assistant", "Lint is green and pushed. Everything you've given me is complete.", sid_n),
        ]))
        try:
            found = {c.session_id: c for c in gather(86400 * 3650, None, use_cli=False)}
        finally:
            PROJECTS_DIR = saved
    ok = True
    if sid_q not in found or found[sid_q].score < 3:
        print("SELF-TEST FAIL: the questioning chat was not detected", file=sys.stderr); ok = False
    if sid_n in found:
        print("SELF-TEST FAIL: a chat with no question was flagged", file=sys.stderr); ok = False
    if "agent-x" in found:
        print("SELF-TEST FAIL: a subagent transcript surfaced", file=sys.stderr); ok = False
    if found.get(sid_q) and not found[sid_q].title.startswith("Build the guest"):
        print("SELF-TEST FAIL: title not taken from the first prompt", file=sys.stderr); ok = False
    print("SELF-TEST PASS" if ok else "SELF-TEST FAILED")
    return 0 if ok else 1


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--since", default="3d", help="window: Nh / Nd / Nw (default 3d)")
    ap.add_argument("--json", action="store_true", help="machine-readable output")
    ap.add_argument("--show", metavar="SESSION", help="print the full last assistant message of one session")
    ap.add_argument("--ledger", type=Path, help="path to operations/questions.md to mark already-filed sessions")
    ap.add_argument("--no-cli", action="store_true", help="skip `claude agents --json --all`")
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args(argv)
    if args.self_test:
        return self_test()
    if not PROJECTS_DIR.is_dir() and not INBOX.is_file():
        print(f"[sweep] cannot read {PROJECTS_DIR} and no hook inbox at {INBOX} — is this the owner's machine?", file=sys.stderr)
        return 2
    since_s = parse_since(args.since)
    if args.show:
        for cand in scan_transcripts(10 * 365 * 86400):
            if cand.session_id == args.show:
                print(f"# {cand.title}\n# cwd {cand.cwd} · branch {cand.branch} · last {cand.last_at}\n")
                print(cand.tail)
                return 0
        print("session not found", file=sys.stderr)
        return 1
    cands = gather(since_s, args.ledger, use_cli=not args.no_cli)
    if args.json:
        print(json.dumps([asdict(c) for c in cands], indent=1))
    else:
        print_table(cands)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
