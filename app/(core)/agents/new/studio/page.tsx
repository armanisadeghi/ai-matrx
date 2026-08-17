import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, MessageSquare, Import, Sparkles, Wand2, Repeat } from "lucide-react";

export const metadata = {
    title: "Agent Studio — coming soon",
    description:
        "The automated system that builds genuinely intelligent agents for you — by interview, by conversation, or by importing the chats you already have.",
};

const APPROACHES = [
    {
        icon: MessageSquare,
        iconClass: "text-purple-600 dark:text-purple-400",
        gradient: "from-purple-500/5 to-fuchsia-500/10",
        title: "The Interview",
        body: "A cast of agents interviews you the way a great journalist would — amplifying what you say, mapping it, digging for what you left out, and arguing with you when you are wrong. You talk. It writes the agent.",
    },
    {
        icon: Repeat,
        iconClass: "text-emerald-600 dark:text-emerald-400",
        gradient: "from-emerald-500/5 to-teal-500/10",
        title: "Conversation that builds itself",
        body: "Just chat, back and forth, until the answers are exactly what you wanted. Behind the conversation the agent definition is being written, run, and tested against what you just said — recursively, automatically, without you ever seeing a settings panel.",
    },
    {
        icon: Import,
        iconClass: "text-sky-600 dark:text-sky-400",
        gradient: "from-sky-500/5 to-blue-500/10",
        title: "Import the chats you already have",
        body: "Export your conversations from ChatGPT, Claude, Gemini or Cursor and drop them in. We build an agent that replicates the exact behavior those transcripts demonstrate — and then keep it consistent, every run, forever. Years of your own prompting, turned into one agent that never forgets any of it.",
        highlight: true,
    },
];

export default function AgentStudioComingSoonPage() {
    return (
        <Card className="h-full w-full bg-textured border-none shadow-lg">
            <div className="p-4 sm:p-6 md:p-8 lg:p-12">
                <div className="flex items-start gap-2.5 sm:gap-3 md:gap-4 mb-8">
                    <Link href="/agents/new">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="hover:bg-accent h-9 w-9 sm:h-10 sm:w-10 flex-shrink-0"
                        >
                            <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
                        </Button>
                    </Link>
                    <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2.5 mb-1.5">
                            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground">
                                Agent Studio
                            </h1>
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                                <Sparkles className="h-3 w-3" />
                                Coming soon
                            </span>
                        </div>
                        <p className="text-sm text-muted-foreground max-w-2xl">
                            Not another form. A system that builds genuinely intelligent agents for
                            you — and proves they work before you ever rely on them.
                        </p>
                    </div>
                </div>

                <div className="rounded-xl border border-border/50 bg-gradient-to-br from-primary/5 to-purple-500/10 p-5 sm:p-6 mb-6">
                    <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 p-2.5 rounded-lg bg-background/90 backdrop-blur-sm shadow-sm">
                            <Wand2 className="h-5 w-5 text-primary" />
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-base font-semibold text-foreground mb-1.5">
                                Everyone else asks you to write a prompt.
                            </h2>
                            <p className="text-sm text-muted-foreground">
                                Writing a good agent means knowing what to say, what to leave out,
                                which model, which tools, and how to tell whether it actually worked.
                                That is a specialist job, and asking a brilliant non-specialist to do
                                it is why most agents are mediocre. Agent Studio does that job for
                                you. You bring the judgment. It brings the engineering — and it does
                                not stop at generating something plausible. It tests, corrects, and
                                keeps the agent consistent as the world moves under it.
                            </p>
                        </div>
                    </div>
                </div>

                <h2 className="text-sm font-semibold text-foreground mb-3">
                    Several ways in. Pick whichever suits you — or let it pick for you.
                </h2>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
                    {APPROACHES.map((approach) => {
                        const Icon = approach.icon;
                        return (
                            <div
                                key={approach.title}
                                className={`relative overflow-hidden rounded-xl p-4 bg-gradient-to-br border shadow-md ${approach.gradient} ${
                                    approach.highlight
                                        ? "border-sky-500/40 lg:col-span-2"
                                        : "border-border/50"
                                }`}
                            >
                                <div className="relative z-10 flex items-start gap-3">
                                    <div className="flex-shrink-0 p-2.5 rounded-lg bg-background/90 backdrop-blur-sm shadow-sm">
                                        <Icon className={`h-5 w-5 ${approach.iconClass}`} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-base font-semibold text-foreground">
                                            {approach.title}
                                            {approach.highlight && (
                                                <span className="ml-2 text-xs font-medium text-sky-700 dark:text-sky-400">
                                                    the big one
                                                </span>
                                            )}
                                        </h3>
                                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                                            {approach.body}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    <div className="rounded-xl border border-dashed border-border/60 p-4 flex items-center justify-center lg:col-span-2">
                        <p className="text-xs text-muted-foreground text-center">
                            …and more. Every way of getting expertise out of a person is an{" "}
                            <span className="font-medium text-foreground">Approach</span>, and Agent
                            Studio is built as a registry of them — never one hardcoded flow.
                        </p>
                    </div>
                </div>

                <div className="mt-6 flex flex-wrap items-center gap-3">
                    <Link href="/agents/new/builder">
                        <Button variant="default" size="sm">
                            Build an agent now
                        </Button>
                    </Link>
                    <p className="text-xs text-muted-foreground">
                        The current builder is live and stays. Agent Studio is what comes next to it.
                    </p>
                </div>
            </div>
        </Card>
    );
}
