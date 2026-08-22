"use client";

// THE SIX PATHS, STATED (Arman, 2026-08-21): "Is this an ALTERNATIVE to the
// interview? Then tell me and make it clear those are 2 separate paths! And is
// the Understudy another path? Then tell me and make those clear." Every one
// of his "what is the difference between those two" questions is answered by a
// table that had never been on screen. This is that table, in plain words,
// one click from the Rulebook header. Nothing here is a doc pointer — the
// answer renders where the confusion happens.

import { HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const ROWS: { name: string; what: string }[] = [
  {
    name: "Getting rules in",
    what: "Interviews, your words, documents, published work, AI chats — many ways, one destination. They are alternatives to each other, and every one of them just adds rules here.",
  },
  {
    name: "The Understudy",
    what: "Not something you build — a free stand-in that rebuilds itself every time your rules change, so there is always something to try. It gets sharper as you approve rules.",
  },
  {
    name: "Quick build",
    what: "Turns your approved rules into a working system with no questions asked. Fast, but it can only make the two shapes we ship.",
  },
  {
    name: "Build it with me",
    what: "A conversation that reads your rules, asks about what's still missing, and builds the system with you. Slower, and it can make anything. This is the main way.",
  },
  {
    name: "The Audition",
    what: "Not a way to build — the proof. It runs what you built against your own real work and asks the only question that matters: do you agree with ours where you don't agree with plain AI?",
  },
  {
    name: "Releasing it",
    what: "When you're happy, you release a system and other people can run it — they never see rules, just a tool that does the job your way.",
  },
];

export function WhatsWhatDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="h-7 text-muted-foreground">
          <HelpCircle className="h-3.5 w-3.5" />
          What&apos;s what here?
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>What&apos;s what here</DialogTitle>
          <DialogDescription>
            Everything on this page belongs to one of six things.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {ROWS.map((row) => (
            <div key={row.name}>
              <p className="text-sm font-medium text-foreground">{row.name}</p>
              <p className="text-sm text-muted-foreground">{row.what}</p>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
