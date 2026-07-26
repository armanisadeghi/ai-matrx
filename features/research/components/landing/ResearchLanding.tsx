import Link from 'next/link';
import { Search, Brain, FileText, Tags, Layers, Shield, Zap, Globe, ArrowRight, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const FEATURES = [
    {
        icon: Search,
        title: 'Smart Search',
        description: 'Automatically searches multiple providers, saves all results, and identifies the most relevant sources.',
    },
    {
        icon: Globe,
        title: 'Multi-Source Reading',
        description: 'Handles web pages, PDFs, YouTube transcripts, and file uploads. Chrome extension catches what automation misses.',
    },
    {
        icon: Brain,
        title: 'Three-Tier AI Analysis',
        description: 'Per-page summaries, keyword-level synthesis, and a comprehensive final report — all powered by specialized AI agents.',
    },
    {
        icon: Tags,
        title: 'Tag-Based Organization',
        description: 'Tag sources by information type, consolidate per tag, and build structured research documents automatically.',
    },
    {
        icon: Layers,
        title: 'Iterative Refinement',
        description: 'Rebuild or update your research incrementally. Add sources, refine tags, and regenerate — without starting over.',
    },
    {
        icon: Shield,
        title: 'Human-in-the-Loop',
        description: 'Full control at every stage. Include/exclude sources, edit content, override quality assessments, and curate results.',
    },
];

const STEPS = [
    { number: '01', title: 'Enter Your Topic', description: 'Type any subject — a company, person, scientific topic, product, or anything else.' },
    { number: '02', title: 'AI Suggests Keywords', description: 'An LLM suggests research keywords, a title, and a description. Pick what fits.' },
    { number: '03', title: 'Automated Pipeline', description: 'The system searches, reads, analyzes, and generates an initial research report.' },
    { number: '04', title: 'Curate & Refine', description: 'Review sources, edit content, add tags, and iterate until the research is complete.' },
];

export default function ResearchLanding() {
    return (
        <div className="min-h-dvh">
            {/* Hero */}
            <section className="relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent" />
                <div className="relative mx-auto max-w-5xl px-4 sm:px-6 pt-16 sm:pt-24 pb-12 sm:pb-20 text-center">
                    <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary mb-6">
                        <Zap className="h-3.5 w-3.5" />
                        AI-Powered Research
                    </div>
                    <h1 className="text-[clamp(2rem,1.5rem+2.5vw,3.75rem)] font-bold tracking-tight text-foreground leading-[1.1]">
                        Research Any Topic,{' '}
                        <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                            Intelligently
                        </span>
                    </h1>
                    <p className="mt-6 mx-auto max-w-2xl text-[clamp(1rem,0.95rem+0.25vw,1.25rem)] text-muted-foreground leading-relaxed">
                        Enter a topic, and our AI pipeline searches the web, reads content, analyzes sources,
                        and generates a comprehensive research report — with you in control at every step.
                    </p>
                    <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
                        <Button size="lg" className="w-full sm:w-auto min-h-[44px] text-base px-8 gap-2" asChild>
                            <Link href="/research/topics">
                                Start Researching
                                <ArrowRight className="h-4 w-4" />
                            </Link>
                        </Button>
                        <Button variant="outline" size="lg" className="w-full sm:w-auto min-h-[44px] text-base px-8" asChild>
                            <Link href="#how-it-works">
                                See How It Works
                            </Link>
                        </Button>
                    </div>
                </div>
            </section>

            {/* Features Grid */}
            <section className="mx-auto max-w-6xl px-4 sm:px-6 py-16 sm:py-24">
                <div className="text-center mb-12 sm:mb-16">
                    <h2 className="text-[clamp(1.5rem,1.25rem+1.5vw,2.5rem)] font-bold tracking-tight">
                        Everything You Need for Deep Research
                    </h2>
                    <p className="mt-4 text-muted-foreground text-lg max-w-2xl mx-auto">
                        A complete pipeline from search to report, with AI agents at every stage.
                    </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                    {FEATURES.map((feature) => (
                        <div
                            key={feature.title}
                            className={cn(
                                'group relative rounded-2xl border border-border bg-card p-6',
                                'transition-all duration-300',
                                'hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5',
                                '[@starting-style]:opacity-0 [@starting-style]:translate-y-4',
                                'opacity-100 translate-y-0',
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
            </section>

            {/* How It Works */}
            <section id="how-it-works" className="bg-card/50 border-y border-border">
                <div className="mx-auto max-w-5xl px-4 sm:px-6 py-16 sm:py-24">
                    <div className="text-center mb-12 sm:mb-16">
                        <h2 className="text-[clamp(1.5rem,1.25rem+1.5vw,2.5rem)] font-bold tracking-tight">
                            How It Works
                        </h2>
                        <p className="mt-4 text-muted-foreground text-lg">
                            From topic to report in four simple steps.
                        </p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8">
                        {STEPS.map((step) => (
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

            {/* Use Cases */}
            <section className="mx-auto max-w-5xl px-4 sm:px-6 py-16 sm:py-24">
                <div className="text-center mb-12">
                    <h2 className="text-[clamp(1.5rem,1.25rem+1.5vw,2.5rem)] font-bold tracking-tight">
                        Research Anything
                    </h2>
                    <p className="mt-4 text-muted-foreground text-lg max-w-2xl mx-auto">
                        Pre-built templates for common research types, fully customizable for anything else.
                    </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[
                        { title: 'Company Research', items: ['Financial profile', 'Key personnel', 'Market position', 'Recent news'] },
                        { title: 'Scientific Research', items: ['Latest publications', 'Key findings', 'Expert opinions', 'Methodology review'] },
                        { title: 'Person Research', items: ['Professional background', 'Public statements', 'Published works', 'Media coverage'] },
                        { title: 'Product Research', items: ['Feature comparison', 'User reviews', 'Pricing analysis', 'Market landscape'] },
                        { title: 'Marketing Analysis', items: ['Competitor landscape', 'Content strategy', 'Social presence', 'Brand positioning'] },
                        { title: 'Custom Research', items: ['Your own keywords', 'Custom agents', 'Specialized templates', 'Any topic imaginable'] },
                    ].map((template) => (
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
            </section>

            {/* CTA */}
            <section className="border-t border-border bg-card/50">
                <div className="mx-auto max-w-3xl px-4 sm:px-6 py-16 sm:py-24 text-center">
                    <h2 className="text-[clamp(1.5rem,1.25rem+1.5vw,2.5rem)] font-bold tracking-tight">
                        Ready to Start Researching?
                    </h2>
                    <p className="mt-4 text-muted-foreground text-lg mb-8">
                        Create your first research project and let AI do the heavy lifting.
                    </p>
                    <Button size="lg" className="min-h-[44px] text-base px-10 gap-2" asChild>
                        <Link href="/research/topics">
                            Get Started Free
                            <ArrowRight className="h-4 w-4" />
                        </Link>
                    </Button>
                </div>
            </section>
        </div>
    );
}
