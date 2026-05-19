import Link from "next/link";
import {
    ArrowRight,
    Brain,
    CheckCircle2,
    ClipboardList,
    Columns3,
    FileAudio,
    Layers,
    ListChecks,
    Mic,
    Network,
    NotebookPen,
    Save,
    ScrollText,
    Tag,
    Upload,
    Users,
    Waves,
    Zap
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STUDIO_PILLARS = [
    {
        icon: Mic,
        title: "Live recording, no time limits",
        description:
            "Capture 1–3 hour meetings, lectures, depositions, or workshops without worrying about cut-offs. A global recording portal keeps the mic alive across navigation, and IndexedDB keeps you crash-safe end to end.",
    },
    {
        icon: Columns3,
        title: "Four columns, one timeline",
        description:
            "Raw transcript, AI-cleaned transcript, extracted concepts, and a configurable module column — all locked to the same timeline with synchronized scrolling so you can jump anywhere and the rest follow.",
    },
    {
        icon: Zap,
        title: "Self-cleaning transcripts",
        description:
            "A dedicated cleaning agent rewrites the raw stream every ~30 seconds — fixing punctuation, attributing speakers, and stitching dropped words. Edit any segment inline; superseded versions stay in the audit trail.",
    },
    {
        icon: Brain,
        title: "Concept extraction in real time",
        description:
            "Every ~200 seconds, a concepts agent surfaces themes, key ideas, named entities, and open questions. By the time the meeting ends, you already have a structured outline of what was actually discussed.",
    },
    {
        icon: Layers,
        title: "Pluggable Column 4 modules",
        description:
            "Swap in the output you need: action-item Tasks, Flashcards for studying, Decisions for choices made, or Quiz for self-testing. Switch mid-session — prior module output is preserved, not lost.",
    },
    {
        icon: Save,
        title: "Save anything, anywhere",
        description:
            "Per-column save toolbars push raw, cleaned, concepts, or module output straight to Notes, Tasks, Scratch, Code, File, or Email — every save carries session metadata so context follows the content.",
    },
];

const MODULES = [
    {
        icon: ListChecks,
        title: "Tasks",
        description: "Extract action items as the meeting unfolds. Assignees, due dates, priorities — ready to push to your task manager the moment recording stops.",
        badge: "Default",
    },
    {
        icon: NotebookPen,
        title: "Flashcards",
        description: "Turn a lecture or training session into a study deck on the fly. Question/answer pairs grouped by topic, ready for review.",
    },
    {
        icon: Network,
        title: "Decisions",
        description: "Capture every decision as it's made — the question, the options weighed, the choice landed on, and who drove it. Output as a structured decision tree.",
    },
    {
        icon: Zap,
        title: "Quiz",
        description: "Test comprehension as you go. The quiz module builds graded questions from the live content so you can verify retention immediately afterward.",
    },
];

const STUDIO_STEPS = [
    {
        number: "01",
        title: "Press record (or paste, or import)",
        description:
            "Start a session and hit Record. Or paste a chunk of text. Or import an audio file or a Supabase URL — Whisper segments come back stamped on the same timeline.",
    },
    {
        number: "02",
        title: "Watch four agents work in parallel",
        description:
            "Raw text streams in. The cleaning agent rewrites every 30s. The concepts agent extracts themes every ~200s. Your chosen module agent works on its own cadence — all visible side by side.",
    },
    {
        number: "03",
        title: "Curate inline",
        description:
            "Edit any segment in any column. Rename the session. Switch modules. Adjust the agent intervals from 15s to 30 minutes per column. The audit trail keeps every prior version.",
    },
    {
        number: "04",
        title: "Export everywhere",
        description:
            "Save individual columns to Notes, Tasks, or files. Promote the whole session to a clean, shareable Transcript record. Your work is portable from the first second.",
    },
];

const PROCESSOR_FEATURES = [
    "Upload audio or video and get a Groq Whisper Large V3 Turbo transcription back",
    "Speaker tracking, timecodes, and segment-level editing",
    "Folders, tags, and full-text search across every transcript",
    "Real-time sync so collaborators see updates instantly",
    "One-click export to text, or promote into the Studio for deeper analysis",
    "Audio playback with auto-refreshing signed URLs",
];

const USE_CASES = [
    { title: "Meetings & standups", items: ["Live action items", "Decision log", "Searchable archive", "Speaker tracking"] },
    { title: "Lectures & study", items: ["Auto-generated flashcards", "Concept outlines", "Quiz from live content", "Resume across days"] },
    { title: "Interviews & research", items: ["Clean transcripts", "Quote extraction", "Named entities", "Theme analysis"] },
    { title: "Depositions & legal", items: ["Verbatim raw + cleaned", "Per-segment audit trail", "Speaker attribution", "Inline edits"] },
    { title: "Sales calls & coaching", items: ["Decisions made", "Follow-up tasks", "Objection themes", "Call summaries"] },
    { title: "Podcasts & content", items: ["Show-notes outlines", "Pull-quote candidates", "Chapter-style concepts", "Multi-format export"] },
];

export default function TranscriptionLanding() {
    return (
        <div className="min-h-dvh">
            {/* Hero */}
            <section className="relative overflow-hidden">
                <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent" />
                <div aria-hidden className="absolute -top-24 -right-24 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
                <div aria-hidden className="absolute -bottom-24 -left-24 h-80 w-80 rounded-full bg-primary/5 blur-3xl" />

                <div className="relative mx-auto max-w-5xl px-4 sm:px-6 pt-16 sm:pt-24 pb-12 sm:pb-20 text-center">
                    <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary mb-6">
                        <Waves className="h-3.5 w-3.5" />
                        AI-Powered Transcription
                    </div>
                    <h1 className="text-[clamp(2rem,1.5rem+2.5vw,3.75rem)] font-bold tracking-tight text-foreground leading-[1.1]">
                        Transcribe, clean, and{" "}
                        <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                            understand
                        </span>{" "}
                        every conversation
                    </h1>
                    <p className="mt-6 mx-auto max-w-2xl text-[clamp(1rem,0.95rem+0.25vw,1.25rem)] text-muted-foreground leading-relaxed">
                        Two ways in: a fast file-based <span className="font-semibold text-foreground">Processor</span> for one-shot transcripts,
                        and the <span className="font-semibold text-foreground">Transcript Studio</span> — a four-column live workspace where
                        AI agents clean, structure, and analyze your content as you record.
                    </p>
                    <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
                        <Button size="lg" className="w-full sm:w-auto min-h-[44px] text-base px-8 gap-2" asChild>
                            <Link href="/transcription/studio">
                                <Mic className="h-4 w-4" />
                                Open the Studio
                                <ArrowRight className="h-4 w-4" />
                            </Link>
                        </Button>
                        <Button variant="outline" size="lg" className="w-full sm:w-auto min-h-[44px] text-base px-8 gap-2" asChild>
                            <Link href="/transcription/processor">
                                <FileAudio className="h-4 w-4" />
                                Use the Processor
                            </Link>
                        </Button>
                    </div>

                    {/* Stat row */}
                    <div className="mt-12 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 max-w-3xl mx-auto">
                        <Stat value="4" label="Live AI columns" />
                        <Stat value="4" label="Module types" />
                        <Stat value="3h+" label="Session length" />
                        <Stat value="∞" label="Speakers tracked" />
                    </div>
                </div>
            </section>

            {/* Two products */}
            <section className="mx-auto max-w-6xl px-4 sm:px-6 py-12 sm:py-16">
                <div className="text-center mb-10 sm:mb-14">
                    <h2 className="text-[clamp(1.5rem,1.25rem+1.5vw,2.5rem)] font-bold tracking-tight">
                        Pick the surface that fits the moment
                    </h2>
                    <p className="mt-4 text-muted-foreground text-lg max-w-2xl mx-auto">
                        Need a transcript right now from a recording you already have? Use the Processor.
                        Want to live-capture a 90-minute meeting and walk out with action items, concepts, and
                        a clean transcript? Open the Studio.
                    </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Studio — emphasized */}
                    <Link
                        href="/transcription/studio"
                        className={cn(
                            "group relative overflow-hidden rounded-3xl border-2 border-primary/30 bg-card p-6 sm:p-8",
                            "transition-all duration-300",
                            "hover:border-primary/60 hover:shadow-2xl hover:shadow-primary/10",
                        )}
                    >
                        <div aria-hidden className="absolute -top-12 -right-12 h-48 w-48 rounded-full bg-primary/10 blur-2xl group-hover:bg-primary/15 transition-colors" />
                        <div className="relative">
                            <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary mb-4 uppercase tracking-wider">
                                <Zap className="h-3 w-3" />
                                Flagship
                            </div>
                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary mb-5">
                                <Mic className="h-6 w-6" />
                            </div>
                            <h3 className="text-2xl font-bold tracking-tight mb-3">Transcript Studio</h3>
                            <p className="text-muted-foreground leading-relaxed mb-5">
                                A four-column live workspace. Record (or paste, or import audio) and watch raw text,
                                AI-cleaned text, extracted concepts, and a pluggable module column build themselves
                                in parallel — all on one synchronized timeline. Built for sessions that run 1–3 hours,
                                with crash-safe IndexedDB and an audit trail of every change.
                            </p>
                            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-6">
                                {[
                                    "4-column synchronized layout",
                                    "Live cleaning every ~30s",
                                    "Concepts every ~200s",
                                    "Tasks / Flashcards / Quiz / Decisions",
                                    "Inline edit + audit trail",
                                    "Crash-safe to 3+ hours",
                                ].map((item) => (
                                    <li key={item} className="flex items-center gap-2 text-sm">
                                        <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                                        <span className="text-foreground/90">{item}</span>
                                    </li>
                                ))}
                            </ul>
                            <div className="inline-flex items-center gap-2 text-sm font-semibold text-primary">
                                Open the Studio
                                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                            </div>
                        </div>
                    </Link>

                    {/* Processor */}
                    <Link
                        href="/transcription/processor"
                        className={cn(
                            "group relative rounded-3xl border border-border bg-card p-6 sm:p-8",
                            "transition-all duration-300",
                            "hover:border-primary/40 hover:shadow-lg",
                        )}
                    >
                        <div className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground mb-4 uppercase tracking-wider">
                            One-shot
                        </div>
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-foreground mb-5">
                            <FileAudio className="h-6 w-6" />
                        </div>
                        <h3 className="text-2xl font-bold tracking-tight mb-3">Transcript Processor</h3>
                        <p className="text-muted-foreground leading-relaxed mb-5">
                            Upload an audio or video file and get a finished transcript back, powered by Groq
                            Whisper Large V3 Turbo. Folders, tags, search, audio playback, segment editing —
                            everything you need for an organized library of finished transcripts.
                        </p>
                        <ul className="grid grid-cols-1 gap-2 mb-6">
                            {PROCESSOR_FEATURES.slice(0, 4).map((item) => (
                                <li key={item} className="flex items-start gap-2 text-sm">
                                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                                    <span className="text-foreground/90">{item}</span>
                                </li>
                            ))}
                        </ul>
                        <div className="inline-flex items-center gap-2 text-sm font-semibold text-primary">
                            Use the Processor
                            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                        </div>
                    </Link>
                </div>
            </section>

            {/* Studio deep-dive */}
            <section id="studio" className="bg-card/40 border-y border-border">
                <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16 sm:py-24">
                    <div className="text-center mb-12 sm:mb-16">
                        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary mb-4">
                            <Zap className="h-3.5 w-3.5" />
                            The Studio
                        </div>
                        <h2 className="text-[clamp(1.5rem,1.25rem+1.5vw,2.75rem)] font-bold tracking-tight">
                            A workspace that writes itself while you talk
                        </h2>
                        <p className="mt-4 text-muted-foreground text-lg max-w-2xl mx-auto leading-relaxed">
                            The Transcript Studio is the centerpiece of the system. Four AI agents work in parallel,
                            each with its own cadence, all locked to one timeline. By the time the conversation ends,
                            the deliverable is already done.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                        {STUDIO_PILLARS.map((feature) => (
                            <div
                                key={feature.title}
                                className={cn(
                                    "group relative rounded-2xl border border-border bg-card p-6",
                                    "transition-all duration-300",
                                    "hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5",
                                )}
                            >
                                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary mb-4 group-hover:scale-110 transition-transform duration-300">
                                    <feature.icon className="h-5 w-5" />
                                </div>
                                <h3 className="text-base font-semibold mb-2">{feature.title}</h3>
                                <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Module column */}
            <section className="mx-auto max-w-6xl px-4 sm:px-6 py-16 sm:py-24">
                <div className="text-center mb-12">
                    <h2 className="text-[clamp(1.5rem,1.25rem+1.5vw,2.5rem)] font-bold tracking-tight">
                        Choose what Column 4 produces
                    </h2>
                    <p className="mt-4 text-muted-foreground text-lg max-w-2xl mx-auto">
                        The fourth column is yours. Pick the module that matches the work — and switch mid-session
                        without losing what came before.
                    </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {MODULES.map((mod) => (
                        <div
                            key={mod.title}
                            className="relative rounded-2xl border border-border bg-card p-5 hover:border-primary/30 transition-colors"
                        >
                            {mod.badge && (
                                <div className="absolute top-3 right-3 inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary uppercase tracking-wider">
                                    {mod.badge}
                                </div>
                            )}
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary mb-3">
                                <mod.icon className="h-4.5 w-4.5" />
                            </div>
                            <h3 className="font-semibold text-sm mb-1.5">{mod.title}</h3>
                            <p className="text-xs text-muted-foreground leading-relaxed">{mod.description}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* How the Studio works */}
            <section id="how-it-works" className="bg-card/50 border-y border-border">
                <div className="mx-auto max-w-5xl px-4 sm:px-6 py-16 sm:py-24">
                    <div className="text-center mb-12 sm:mb-16">
                        <h2 className="text-[clamp(1.5rem,1.25rem+1.5vw,2.5rem)] font-bold tracking-tight">
                            From silence to deliverable in one session
                        </h2>
                        <p className="mt-4 text-muted-foreground text-lg max-w-2xl mx-auto">
                            Four steps. The first three happen automatically while you talk.
                        </p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8">
                        {STUDIO_STEPS.map((step) => (
                            <div key={step.number} className="flex gap-4">
                                <div className="flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-2xl bg-primary/10 text-primary font-bold text-lg">
                                    {step.number}
                                </div>
                                <div>
                                    <h3 className="font-semibold text-base mb-1">{step.title}</h3>
                                    <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Processor deep-dive */}
            <section className="mx-auto max-w-6xl px-4 sm:px-6 py-16 sm:py-24">
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-10 items-center">
                    <div className="lg:col-span-2">
                        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/50 px-4 py-1.5 text-sm font-medium text-muted-foreground mb-4">
                            <FileAudio className="h-3.5 w-3.5" />
                            The Processor
                        </div>
                        <h2 className="text-[clamp(1.5rem,1.25rem+1.5vw,2.5rem)] font-bold tracking-tight mb-4">
                            Have a recording? Get a transcript.
                        </h2>
                        <p className="text-muted-foreground text-lg leading-relaxed mb-6">
                            The Transcript Processor is the simple, file-first counterpart to the Studio. Drop in
                            an audio or video file, get a clean transcript with speakers and timecodes, and organize
                            it into folders alongside the rest of your library.
                        </p>
                        <Button size="lg" className="min-h-[44px] text-base px-6 gap-2" asChild>
                            <Link href="/transcription/processor">
                                Open the Processor
                                <ArrowRight className="h-4 w-4" />
                            </Link>
                        </Button>
                    </div>
                    <div className="lg:col-span-3">
                        <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
                            <ul className="space-y-3">
                                {PROCESSOR_FEATURES.map((item) => (
                                    <li key={item} className="flex items-start gap-3 text-sm">
                                        <div className="flex h-5 w-5 items-center justify-center rounded-md bg-primary/10 text-primary shrink-0 mt-0.5">
                                            <CheckCircle2 className="h-3.5 w-3.5" />
                                        </div>
                                        <span className="text-foreground/90 leading-relaxed">{item}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>
            </section>

            {/* Use cases */}
            <section className="bg-card/40 border-y border-border">
                <div className="mx-auto max-w-5xl px-4 sm:px-6 py-16 sm:py-24">
                    <div className="text-center mb-12">
                        <h2 className="text-[clamp(1.5rem,1.25rem+1.5vw,2.5rem)] font-bold tracking-tight">
                            Built for the work people actually do
                        </h2>
                        <p className="mt-4 text-muted-foreground text-lg max-w-2xl mx-auto">
                            One system covers meetings, classes, interviews, depositions, sales calls, and content
                            production — because the four columns are configurable and the modules are pluggable.
                        </p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {USE_CASES.map((template) => (
                            <div key={template.title} className="rounded-xl border border-border bg-card p-5">
                                <h3 className="font-semibold text-sm mb-3">{template.title}</h3>
                                <ul className="space-y-2">
                                    {template.items.map((item) => (
                                        <li key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                                            <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                                            {item}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* What sets it apart */}
            <section className="mx-auto max-w-6xl px-4 sm:px-6 py-16 sm:py-24">
                <div className="text-center mb-12">
                    <h2 className="text-[clamp(1.5rem,1.25rem+1.5vw,2.5rem)] font-bold tracking-tight">
                        Why this isn&rsquo;t just another transcription tool
                    </h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <Highlight
                        icon={<Zap className="h-5 w-5" />}
                        title="Parallel agents, one timeline"
                        body="Four AI agents — raw capture, cleanup, concepts, module — work concurrently and stay locked to a single time coordinate. Scroll one column and the other three follow."
                    />
                    <Highlight
                        icon={<ScrollText className="h-5 w-5" />}
                        title="Resume-marker cleaning"
                        body="Cleanup runs incrementally with a [[RESUME]] anchor — the agent picks up exactly where it left off, replacing only what changed. No restarts, no duplicated work."
                    />
                    <Highlight
                        icon={<Tag className="h-5 w-5" />}
                        title="Bidirectional with Transcripts"
                        body="Promote any quick transcript into a full Studio session, or save a Studio session back as a clean, shareable Transcript record. Your work moves between the two without losing anything."
                    />
                    <Highlight
                        icon={<Upload className="h-5 w-5" />}
                        title="Multi-source ingest"
                        body="Live recording, paste, file upload, URL, or cloud files. Whisper segments and pasted text all stamp onto the same timeline so live and imported content coexist seamlessly."
                    />
                    <Highlight
                        icon={<ClipboardList className="h-5 w-5" />}
                        title="Per-column save toolbars"
                        body="Every column has its own save bar — push raw to a file, cleaned to Notes, concepts to Scratch, action items to Tasks — each save carries the session metadata as context."
                    />
                    <Highlight
                        icon={<Users className="h-5 w-5" />}
                        title="Multi-scope from day one"
                        body="Sessions, transcripts, and modules respect user / organization / project scope, with the canonical resource-access policy enforced at the database level."
                    />
                </div>
            </section>

            {/* CTA */}
            <section className="border-t border-border bg-card/50">
                <div className="mx-auto max-w-3xl px-4 sm:px-6 py-16 sm:py-24 text-center">
                    <h2 className="text-[clamp(1.5rem,1.25rem+1.5vw,2.5rem)] font-bold tracking-tight">
                        Stop typing notes. Start capturing meaning.
                    </h2>
                    <p className="mt-4 text-muted-foreground text-lg mb-10">
                        Open the Studio for your next call, or push an existing recording through the Processor.
                        Everything you produce stays organized, editable, and exportable.
                    </p>
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                        <Button size="lg" className="w-full sm:w-auto min-h-[44px] text-base px-8 gap-2" asChild>
                            <Link href="/transcription/studio">
                                <Mic className="h-4 w-4" />
                                Open the Studio
                                <ArrowRight className="h-4 w-4" />
                            </Link>
                        </Button>
                        <Button variant="outline" size="lg" className="w-full sm:w-auto min-h-[44px] text-base px-8 gap-2" asChild>
                            <Link href="/transcription/processor">
                                <FileAudio className="h-4 w-4" />
                                Use the Processor
                            </Link>
                        </Button>
                    </div>
                </div>
            </section>
        </div>
    );
}

function Stat({ value, label }: { value: string | number; label: string }) {
    return (
        <div className="rounded-xl border border-border bg-card/60 backdrop-blur px-4 py-3 text-left">
            <div className="text-2xl md:text-3xl font-bold tracking-tight">{value}</div>
            <div className="text-xs text-muted-foreground mt-0.5 uppercase tracking-wider">{label}</div>
        </div>
    );
}

function Highlight({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
    return (
        <div className="rounded-2xl border border-border bg-card p-5 hover:border-primary/30 transition-colors">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary mb-3">
                {icon}
            </div>
            <h3 className="font-semibold text-base mb-1.5">{title}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
        </div>
    );
}
