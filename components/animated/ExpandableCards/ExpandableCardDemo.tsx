"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useOutsideClick } from "@/hooks/use-outside-click";

export function LatestAiModels() {
    const [active, setActive] = useState<(typeof cards)[number] | boolean | null>(null);
    const ref = useRef<HTMLDivElement>(null);
    const id = useId();

    useEffect(() => {
        function onKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape") {
                setActive(false);
            }
        }

        if (active && typeof active === "object") {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "auto";
        }

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [active]);

    useOutsideClick(ref, () => setActive(null));

    return (
        <>
            <AnimatePresence>
                {active && typeof active === "object" && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/20 h-full w-full z-10"
                    />
                )}
            </AnimatePresence>
            <AnimatePresence>
                {active && typeof active === "object" ? (
                    <div className="fixed inset-0  grid place-items-center z-[100]">
                        <motion.button
                            key={`button-${active.title}-${id}`}
                            layout
                            initial={{
                                opacity: 0,
                            }}
                            animate={{
                                opacity: 1,
                            }}
                            exit={{
                                opacity: 0,
                                transition: {
                                    duration: 0.05,
                                },
                            }}
                            className="flex absolute top-2 right-2 lg:hidden items-center justify-center bg-white rounded-full h-6 w-6"
                            onClick={() => setActive(null)}
                        >
                            <CloseIcon />
                        </motion.button>
                        <motion.div
                            layoutId={`card-${active.title}-${id}`}
                            ref={ref}
                            className="w-full max-w-[500px]  h-full md:h-fit md:max-h-[90%]  flex flex-col bg-white dark:bg-neutral-900 sm:rounded-3xl overflow-hidden"
                        >
                            <motion.div layoutId={`image-${active.title}-${id}`}>
                                <img
                                    width={200}
                                    height={200}
                                    src={active.src}
                                    alt={active.title}
                                    className="w-full h-80 lg:h-80 sm:rounded-tr-lg sm:rounded-tl-lg object-cover object-top"
                                />
                            </motion.div>

                            <div>
                                <div className="flex justify-between items-start p-4">
                                    <div className="">
                                        <motion.h3
                                            layoutId={`title-${active.title}-${id}`}
                                            className="font-bold text-neutral-700 dark:text-neutral-200"
                                        >
                                            {active.title}
                                        </motion.h3>
                                        <motion.p
                                            layoutId={`description-${active.description}-${id}`}
                                            className="text-neutral-600 dark:text-neutral-400"
                                        >
                                            {active.description}
                                        </motion.p>
                                    </div>

                                    <motion.a
                                        layoutId={`button-${active.title}-${id}`}
                                        href={active.ctaLink}
                                        target="_blank"
                                        className="px-4 py-3 text-sm rounded-full font-bold bg-green-500 text-white"
                                    >
                                        {active.ctaText}
                                    </motion.a>
                                </div>
                                <div className="pt-4 relative px-4">
                                    <motion.div
                                        layout
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        className="text-neutral-600 text-xs md:text-sm lg:text-base h-40 md:h-fit pb-10 flex flex-col items-start gap-4 overflow-auto dark:text-neutral-400 [mask:linear-gradient(to_bottom,white,white,transparent)] scrollbar-hide"
                                    >
                                        {typeof active.content === "function" ? active.content() : active.content}
                                    </motion.div>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                ) : null}
            </AnimatePresence>
            {/* Mobile: horizontal scroll carousel */}
            <div className="flex md:hidden gap-3 overflow-x-auto scrollbar-none px-1 pb-1 -mx-1">
                {cards.map((card) => (
                    <motion.div
                        layoutId={`card-${card.title}-${id}`}
                        key={`card-${card.title}-${id}`}
                        onClick={() => setActive(card)}
                        className="flex-none w-[130px] flex flex-col items-center gap-2 p-2 rounded-2xl cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800 active:scale-95 transition-transform"
                    >
                        <motion.div layoutId={`image-${card.title}-${id}`} className="w-full">
                            <img
                                width={130}
                                height={100}
                                src={card.src}
                                alt={card.title}
                                className="w-full h-[88px] rounded-xl object-cover object-top"
                            />
                        </motion.div>
                        <div className="w-full text-center">
                            <motion.h3
                                layoutId={`title-${card.title}-${id}`}
                                className="text-[11px] font-semibold text-neutral-800 dark:text-neutral-200 leading-tight truncate"
                            >
                                {card.title}
                            </motion.h3>
                            <motion.p
                                layoutId={`description-${card.description}-${id}`}
                                className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate"
                            >
                                {card.description}
                            </motion.p>
                        </div>
                        <motion.button
                            layoutId={`button-${card.title}-${id}`}
                            className="w-full px-2 py-1 text-[11px] rounded-full font-bold bg-gray-100 dark:bg-neutral-700 hover:bg-green-500 hover:text-white text-black dark:text-neutral-200"
                        >
                            {card.ctaText}
                        </motion.button>
                    </motion.div>
                ))}
            </div>

            {/* Desktop: original vertical list */}
            <ul className="hidden md:block max-w-2xl mx-auto w-full gap-4">
                {cards.map((card) => (
                    <motion.div
                        layoutId={`card-${card.title}-${id}`}
                        key={`card-${card.title}-${id}`}
                        onClick={() => setActive(card)}
                        className="py-2 px-4 flex flex-col md:flex-row justify-between items-center hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-3xl cursor-pointer"
                    >
                        <div className="flex gap-2 flex-col md:flex-row">
                            <motion.div layoutId={`image-${card.title}-${id}`}>
                                <img
                                    width={100}
                                    height={100}
                                    src={card.src}
                                    alt={card.title}
                                    className="h-40 w-40 md:h-14 md:w-14 rounded-lg object-cover object-top"
                                />
                            </motion.div>
                            <div className="">
                                <motion.h3
                                    layoutId={`title-${card.title}-${id}`}
                                    className="font-medium text-neutral-800 dark:text-neutral-200 text-center md:text-left"
                                >
                                    {card.title}
                                </motion.h3>
                                <motion.p
                                    layoutId={`description-${card.description}-${id}`}
                                    className="text-neutral-600 dark:text-neutral-400 text-center md:text-left"
                                >
                                    {card.description}
                                </motion.p>
                            </div>
                        </div>
                        <motion.button
                            layoutId={`button-${card.title}-${id}`}
                            className="px-4 py-2 text-sm rounded-full font-bold bg-gray-100 hover:bg-green-500 hover:text-white text-black mt-4 md:mt-0"
                        >
                            {card.ctaText}
                        </motion.button>
                    </motion.div>
                ))}
            </ul>
        </>
    );
}

export const CloseIcon = () => {
    return (
        <motion.svg
            initial={{
                opacity: 0,
            }}
            animate={{
                opacity: 1,
            }}
            exit={{
                opacity: 0,
                transition: {
                    duration: 0.05,
                },
            }}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4 text-black"
        >
            <path stroke="none" d="M0 0h24v24H0z" fill="none" />
            <path d="M18 6l-12 12" />
            <path d="M6 6l12 12" />
        </motion.svg>
    );
};

const cards = [
    {
        description: "Anthropic",
        title: "Claude 3.7 Sonnet",
        src: "/model-card-images/claude-37-sonnet.jpg",
        ctaText: "Try",
        ctaLink: "/chat",
        content: () => {
            return (
                <div className="space-y-3">
                    <p className="font-medium">Claude 3.7 Sonnet | Anthropic Artificial Intelligence</p>
                    
                    <p>
                        Claude 3.7 Sonnet, introduced by Anthropic in February 2025, delivers revolutionary hybrid reasoning capabilities, 
                        seamlessly blending rapid responses with comprehensive, detailed analysis.
                    </p>
                    
                    <p>
                        Ideal for tasks from quick inquiries to intricate problem-solving, it excels in software development, data
                        analysis, and creative writing, achieving an impressive 70.3% accuracy on the SWE-bench Verified benchmark.
                    </p>
                    
                    <p>
                        Widely accessible through Amazon Bedrock and Google Cloud's Vertex AI, Claude 3.7 Sonnet empowers businesses and developers
                        with unparalleled adaptability and innovation.
                    </p>
                </div>
            );
        },
    },
    {
        description: "DeepSeek",
        title: "DeepSeek V3",
        src: "/model-card-images/deepseek-v3.jpg",
        ctaText: "Try",
        ctaLink: "/chat",
        content: () => {
            return (
                <div className="space-y-3">
                    <p className="font-medium">DeepSeek-V3-0324 | DeepSeek Artificial Intelligence</p>
                    
                    <p>
                        DeepSeek-V3-0324, launched in March 2025, is a state-of-the-art open-source AI model that maximizes efficiency and precision.
                    </p>
                    
                    <p>
                        Utilizing a Mixture-of-Experts architecture with 671 billion parameters and activating 37 billion per token, 
                        it delivers lightning-fast performance up to 60 tokens per second.
                    </p>
                    
                    <p>
                        With groundbreaking Multi-head Latent Attention and DeepThink modes, it excels in complex reasoning tasks,
                        scoring exceptionally on benchmarks such as 81.2% on MMLU-Pro and 49.2% on LiveCodeBench.
                    </p>
                    
                    <p>
                        Available under the MIT License via Hugging Face and GitHub, it fosters transparent, community-driven innovation.
                    </p>
                </div>
            );
        },
    },
    {
        description: "Google DeepMind",
        title: "Gemini 2.5 Pro",
        src: "/model-card-images/gemini-25-pro.png",
        ctaText: "Try",
        ctaLink: "/chat",
        content: () => {
            return (
                <div className="space-y-3">
                    <p className="font-medium">Gemini 2.5 Pro | Google DeepMind Artificial Intelligence</p>
                    
                    <p>
                        Gemini 2.5 Pro, unveiled by Google DeepMind in March 2025, sets a new benchmark in multimodal AI with exceptional 
                        reasoning and analysis capabilities.
                    </p>
                    
                    <p>
                        Featuring a vast 1 million token context window, it achieves leading scores of 84.0% on GPQA and 86.7% on AIME 2025 benchmarks.
                    </p>
                    
                    <p>
                        Gemini 2.5 Pro seamlessly processes text, images, audio, video, and code, enhancing interactive simulations and data-driven tasks.
                    </p>
                    
                    <p>
                        Accessible via Google AI Studio and Vertex AI, it is freely available with advanced options, providing unmatched versatility for
                        complex business solutions.
                    </p>
                </div>
            );
        },
    },
    {
        description: "OpenAI",
        title: "GPT 4.1",
        src: "/model-card-images/gpt-41.jpg",
        ctaText: "Try",
        ctaLink: "/chat",
        content: () => {
            return (
                <div className="space-y-3">
                    <p className="font-medium">GPT-4.1 | OpenAI Artificial Intelligence</p>
                    
                    <p>
                        GPT-4.1, released by OpenAI in April 2025, redefines AI-assisted development with a robust 1 million token context window 
                        ideal for processing large codebases and extensive documentation.
                    </p>
                    
                    <p>
                        Excelling in multimodal tasks with a 72.0% score on Video-MME and favored by human evaluators in 80% of assessments, 
                        GPT-4.1 streamlines coding and frontend development workflows.
                    </p>
                    
                    <p>
                        Available via the OpenAI API and Azure OpenAI Service, GPT-4.1 combines precision with versatility, 
                        greatly enhancing productivity and creativity for developers and enterprises alike.
                    </p>
                </div>
            );
        },
    },
    {
        description: "Meta",
        title: "Llama 4",
        src: "/model-card-images/llama-4.jpg",
        ctaText: "Try",
        ctaLink: "/chat",
        content: () => {
            return (
                <div className="space-y-3">
                    <p className="font-medium">Llama 4 | Meta Artificial Intelligence</p>
                    
                    <p>
                        Llama 4, announced by Meta in April 2025, pioneers open-weight multimodal AI using innovative Mixture-of-Experts technology.
                    </p>
                    
                    <p>
                        Its variants, Scout and Maverick, combine 17 billion active parameters with an extensive context window (up to 10 million tokens), 
                        excelling in coding, reasoning, and multimedia understanding.
                    </p>
                    
                    <p>
                        Trained on over 30 trillion tokens across diverse media, Llama 4 achieves superior performance and efficiency, 
                        operating seamlessly even on single GPUs.
                    </p>
                    
                    <p>
                        Available on Hugging Face and Meta AI platforms, Llama 4 is a powerful tool driving innovation across diverse business applications.
                    </p>
                </div>
            );
        },
    },
    {
        description: "xAI",
        title: "Grok 3",
        src: "/model-card-images/grok-3.jpg",
        ctaText: "Try",
        ctaLink: "/chat",
        content: () => {
            return (
                <div className="space-y-3">
                    <p className="font-medium">Grok 3 | xAI Artificial Intelligence</p>
                    
                    <p>
                        Grok 3, introduced by xAI in February 2025, delivers cutting-edge AI with advanced reasoning and intuitive user-centric features.
                    </p>
                    
                    <p>
                        Its Think Mode provides transparent, step-by-step analysis, while DeepSearch offers real-time, web-integrated insights.
                    </p>
                    
                    <p>
                        Grok 3 excels across multimodal tasks, surpassing GPT-4o on key benchmarks like AIME and GPQA. 
                        It uniquely offers specialized modes including adult-oriented interactions.
                    </p>
                    
                    <p>
                        Available via xAI API, X Premium+, and SuperGrok subscriptions, Grok 3 ensures businesses achieve unmatched flexibility, 
                        transparency, and personalized user engagement.
                    </p>
                </div>
            );
        },
    },
    {
        description: "AI Matrx",
        title: "Matrx-AI 1.0",
        src: "/model-card-images/matrx-ai-1.0-2.jpg",
        ctaText: "Try",
        ctaLink: "/chat",
        content: () => {
            return (
                <div className="space-y-3">
                    <p className="font-medium">Matrx-AI 1.0 | AI Matrx</p>
                    
                    <p>
                        Matrx-AI-1.0, launched in 2025, fuses the power of Grok 3, Gemini 2.5 Pro, and GPT-4.1 into a single, intelligent system.
                    </p>
                    
                    <p>
                        Its unique task-routing optimizes each request, delivering lightning-fast responses and unmatched quality.
                    </p>
                    
                    <p>
                        Excelling in coding (54.6% on SWE-bench Verified), multimodal processing (72.0% on Video-MME), and reasoning (86.7% on AIME 2025), 
                        it handles vast datasets with a 1M token context window.
                    </p>
                    
                    <p>
                        Available via a scalable API, Matrx-AI-1.0 empowers businesses with seamless, high-performance solutions for software development, 
                        analytics, and innovation.
                    </p>
                </div>
            );
        },
    },
];
