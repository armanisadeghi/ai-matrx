"use client";

import React, { useState, useRef, useEffect, JSX } from "react";
import { useRouter } from "next/navigation";
import "katex/dist/katex.min.css";
import { BlockMath } from "react-katex";
import { motion } from "motion/react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PartyPopper } from "lucide-react";
import { MathProblemProps, Solution } from "../types";
import ControlPanel from "./ControlPanel";
import InlineMathText from "./InlineMathText";
import SolutionAnswer from "./SolutionAnswer";

const MathProblemImpl: React.FC<MathProblemProps> = ({
    id,
    title,
    course_name,
    topic_name,
    module_name,
    description,
    intro_text,
    final_statement,
    problem_statement,
    solutions,
}) => {
    const router = useRouter();
    const [currentSolutionIndex, setCurrentSolutionIndex] = useState(0);
    const [currentStepIndex, setCurrentStepIndex] = useState(-1);
    const [isNewSolution, setIsNewSolution] = useState(true);
    const [isFinalSolution, setIsFinalSolution] = useState(false);
    const [isFinalStep, setIsFinalStep] = useState(false);
    const [stage, setStage] = useState<"overview" | "intro" | "solution">("overview");
    const [subStage, setSubStage] = useState<"steps" | "solutionAnswer" | "transition" | "finalStatement">("steps");
    const [displayedContent, setDisplayedContent] = useState<JSX.Element[]>([]);
    const [showCongratulations, setShowCongratulations] = useState(false);

    const contentRef = useRef<HTMLDivElement>(null);
    const lastContentRef = useRef<HTMLDivElement>(null);

    // Initial content load
    useEffect(() => {
        rebuildContent();
    }, []);

    // Helper: Find the actual scrollable container (could be Card or a parent)
    const findScrollContainer = (): HTMLElement | null => {
        let element: HTMLElement | null = contentRef.current;
        
        // Check up to 5 levels of parents
        for (let i = 0; i < 5 && element; i++) {
            const { overflowY, overflowX, overflow } = window.getComputedStyle(element);
            const hasScroll = 
                overflowY === 'auto' || overflowY === 'scroll' ||
                overflowX === 'auto' || overflowX === 'scroll' ||
                overflow === 'auto' || overflow === 'scroll';
            
            if (hasScroll && element.scrollHeight > element.clientHeight) {
                return element;
            }
            element = element.parentElement;
        }
        
        return contentRef.current;
    };

    // Auto-scroll when content changes - wait for animation to complete
    useEffect(() => {
        if (!lastContentRef.current) return;

        setTimeout(() => {
            const scrollContainer = findScrollContainer();
            if (!scrollContainer || !lastContentRef.current) return;

            // Get absolute positions
            const containerRect = scrollContainer.getBoundingClientRect();
            const lastElementRect = lastContentRef.current.getBoundingClientRect();
            
            // Calculate how much to scroll to position new content in lower 3/4 of viewport
            const viewportHeight = containerRect.height;
            const targetPosition = viewportHeight * 0.25; // Position at 25% from top
            
            // Distance from top of container to last element
            const elementOffsetFromContainerTop = lastElementRect.top - containerRect.top + scrollContainer.scrollTop;
            
            // Calculate target scroll position
            const targetScroll = elementOffsetFromContainerTop - targetPosition;
            
            // Smooth scroll to position
            scrollContainer.scrollTo({
                top: Math.max(0, targetScroll),
                behavior: 'smooth'
            });
        }, 350); // Wait for motion/react animation to complete
    }, [displayedContent]);

    const isLastSolution = (index: number = currentSolutionIndex) => index === solutions.length - 1;
    const isLastStep = (solutionIndex: number = currentSolutionIndex, stepIndex: number = currentStepIndex) =>
        stepIndex === solutions[solutionIndex].steps.length - 1;
    const hasTransitionText = (solutionIndex: number = currentSolutionIndex) => !!solutions[solutionIndex].transitionText;

    const addContent = (content: JSX.Element) => {
        setDisplayedContent((prev) => [...prev, content]);
    };

    const rebuildContent = () => {
        setDisplayedContent([]);

        if (stage === "overview") {
            addContent(
                <div key="overview" className="space-y-3">
                    <div className="relative bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 rounded-xl p-4 border-2 border-blue-200 dark:border-blue-800">
                        <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-blue-500 to-purple-500 rounded-l-xl" />
                        <h2 className="text-lg font-bold mb-1 text-blue-900 dark:text-blue-100 ml-2.5">
                            <InlineMathText text={title} />
                        </h2>
                        {description && (
                            <p className="text-sm text-blue-700 dark:text-blue-300 ml-2.5">
                                <InlineMathText text={description} />
                            </p>
                        )}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 rounded-lg p-2 border border-emerald-200 dark:border-emerald-800">
                            <div className="text-[10px] uppercase font-semibold text-emerald-600 dark:text-emerald-400 mb-0.5">Course</div>
                            <div className="font-semibold text-xs text-emerald-900 dark:text-emerald-100">{course_name}</div>
                        </div>
                        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 rounded-lg p-2 border border-blue-200 dark:border-blue-800">
                            <div className="text-[10px] uppercase font-semibold text-blue-600 dark:text-blue-400 mb-0.5">Topic</div>
                            <div className="font-semibold text-xs text-blue-900 dark:text-blue-100">{topic_name}</div>
                        </div>
                        <div className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30 rounded-lg p-2 border border-purple-200 dark:border-purple-800">
                            <div className="text-[10px] uppercase font-semibold text-purple-600 dark:text-purple-400 mb-0.5">Module</div>
                            <div className="font-semibold text-xs text-purple-900 dark:text-purple-100">{module_name}</div>
                        </div>
                    </div>
                </div>
            );
            return;
        }

        if (stage === "intro" || stage === "solution") {
            if (stage === "intro") {
                addContent(
                    <div key="intro" className="bg-blue-50/50 dark:bg-blue-950/20 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
                        <p className="text-sm text-blue-900 dark:text-blue-100 leading-relaxed">
                            <InlineMathText text={intro_text} />
                        </p>
                    </div>
                );
            }

            addContent(
                <div key="problem-statement" className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 rounded-lg p-3 border-2 border-amber-300 dark:border-amber-700">
                    <div className="text-xs uppercase font-bold text-amber-700 dark:text-amber-400 mb-2">Problem</div>
                    <p className="text-sm text-amber-900 dark:text-amber-100 mb-2">
                        <InlineMathText text={problem_statement.text} />
                    </p>
                    <div className="bg-white/70 dark:bg-gray-900/70 rounded-lg p-2 mb-2 overflow-x-auto">
                        <BlockMath math={problem_statement.equation} />
                    </div>
                    <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                        <InlineMathText text={problem_statement.instruction} />
                    </p>
                </div>
            );
        }

        if (stage === "solution") {
            const currentSolution = solutions[currentSolutionIndex];
            addContent(
                <div key={`task-${currentSolutionIndex}`} className="bg-indigo-50/50 dark:bg-indigo-950/20 rounded-lg p-3 border border-indigo-200 dark:border-indigo-800">
                    <div className="text-xs uppercase font-bold text-indigo-700 dark:text-indigo-400 mb-1">Approach</div>
                    <p className="text-sm text-indigo-900 dark:text-indigo-100">
                        <InlineMathText text={currentSolution.task} />
                    </p>
                </div>
            );

            if (subStage === "steps") {
                // Safety check: ensure we don't exceed array bounds
                const maxStepIndex = Math.min(currentStepIndex, currentSolution.steps.length - 1);
                for (let i = 0; i <= maxStepIndex; i++) {
                    const step = currentSolution.steps[i];
                    if (step) {
                        const stepColor = i % 3 === 0 ? 'emerald' : i % 3 === 1 ? 'blue' : 'purple';
                        const colorClasses = {
                            emerald: {
                                bg: 'from-emerald-50 to-teal-50 dark:from-emerald-950/20 dark:to-teal-950/20',
                                border: 'border-emerald-300 dark:border-emerald-700',
                                text: 'text-emerald-700 dark:text-emerald-400',
                                titleText: 'text-emerald-900 dark:text-emerald-100',
                                accent: 'from-emerald-500 to-teal-500'
                            },
                            blue: {
                                bg: 'from-blue-50 to-cyan-50 dark:from-blue-950/20 dark:to-cyan-950/20',
                                border: 'border-blue-300 dark:border-blue-700',
                                text: 'text-blue-700 dark:text-blue-400',
                                titleText: 'text-blue-900 dark:text-blue-100',
                                accent: 'from-blue-500 to-cyan-500'
                            },
                            purple: {
                                bg: 'from-purple-50 to-pink-50 dark:from-purple-950/20 dark:to-pink-950/20',
                                border: 'border-purple-300 dark:border-purple-700',
                                text: 'text-purple-700 dark:text-purple-400',
                                titleText: 'text-purple-900 dark:text-purple-100',
                                accent: 'from-purple-500 to-pink-500'
                            }
                        }[stepColor];
                        
                        addContent(
                            <div key={`step-${currentSolutionIndex}-${i}`} className="relative">
                                {/* Step separator line */}
                                {i > 0 && (
                                    <div className="h-px bg-gradient-to-r from-transparent via-gray-300 dark:via-gray-700 to-transparent mb-2" />
                                )}
                                <div className={`relative bg-gradient-to-br ${colorClasses.bg} rounded-lg p-3 border-2 ${colorClasses.border}`}>
                                    <div className={`absolute top-0 left-0 w-1 h-full bg-gradient-to-b ${colorClasses.accent} rounded-l-lg`} />
                                    <div className="ml-2">
                                        <h4 className={`font-bold text-sm mb-1.5 ${colorClasses.titleText}`}>
                                            <InlineMathText text={step.title} />
                                        </h4>
                                        <div className="bg-white/70 dark:bg-gray-900/70 rounded-lg p-2 mb-1.5 overflow-x-auto">
                                            <BlockMath math={step.equation} />
                                        </div>
                                        {step.explanation && (
                                            <p className={`text-xs leading-relaxed ${colorClasses.text}`}>
                                                <InlineMathText text={step.explanation} />
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    }
                }
            } else if (subStage === "solutionAnswer") {
                addContent(
                    <div key={`final-answer-${currentSolutionIndex}`} className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 rounded-xl p-4 border-2 border-green-300 dark:border-green-700">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="w-1.5 h-6 bg-gradient-to-b from-green-500 to-emerald-500 rounded-full" />
                            <h3 className="text-sm font-bold text-green-900 dark:text-green-100">Final Answer</h3>
                        </div>
                        <div className="bg-white/80 dark:bg-gray-900/80 rounded-lg p-3 border border-green-200 dark:border-green-800 overflow-x-auto">
                            <SolutionAnswer answer={currentSolution.solutionAnswer} />
                        </div>
                    </div>
                );
            } else if (subStage === "transition" && currentSolution.transitionText) {
                addContent(
                    <div key={`transition-${currentSolutionIndex}`} className="bg-violet-50/50 dark:bg-violet-950/20 rounded-lg p-3 border border-violet-200 dark:border-violet-800">
                        <p className="text-sm text-violet-900 dark:text-violet-100 italic">
                            <InlineMathText text={currentSolution.transitionText} />
                        </p>
                    </div>
                );
            } else if (subStage === "finalStatement") {
                addContent(
                    <div key="final-statement" className="bg-gradient-to-br from-teal-50 to-cyan-50 dark:from-teal-950/30 dark:to-cyan-950/30 rounded-xl p-4 border-2 border-teal-300 dark:border-teal-700">
                        <div className="flex items-center gap-2 mb-2">
                            <PartyPopper className="w-6 h-6 text-teal-600 dark:text-teal-400" />
                            <h3 className="text-sm font-bold text-teal-900 dark:text-teal-100">Great Job!</h3>
                        </div>
                        <p className="text-sm text-teal-900 dark:text-teal-100 leading-relaxed">
                            <InlineMathText text={final_statement} />
                        </p>
                    </div>
                );
            }
        }
    };

    const nextStep = () => {
        if (stage === "overview") {
            setStage("intro");
            setTimeout(() => rebuildContent(), 0);
        } else if (stage === "intro") {
            setStage("solution");
            setSubStage("steps");
            setCurrentStepIndex(0);
            setIsNewSolution(true);
            setIsFinalSolution(isLastSolution());
            setIsFinalStep(isLastStep());
            setTimeout(() => rebuildContent(), 0);
        } else if (stage === "solution") {
            if (isNewSolution) {
                setIsNewSolution(false);
                rebuildContent();
            } else if (subStage === "steps") {
                if (!isFinalStep) {
                    const nextStep = currentStepIndex + 1;
                    setCurrentStepIndex(nextStep);
                    setIsFinalStep(isLastStep(currentSolutionIndex, nextStep));
                    rebuildContent();
                } else {
                    setSubStage("solutionAnswer");
                    rebuildContent();
                }
            } else if (subStage === "solutionAnswer") {
                if (hasTransitionText()) {
                    setSubStage("transition");
                    rebuildContent();
                } else if (!isFinalSolution) {
                    const nextSolution = currentSolutionIndex + 1;
                    setCurrentSolutionIndex(nextSolution);
                    setCurrentStepIndex(0);
                    setIsNewSolution(true);
                    setIsFinalSolution(isLastSolution(nextSolution));
                    setIsFinalStep(false);
                    setSubStage("steps");
                    rebuildContent();
                } else {
                    setSubStage("finalStatement");
                    rebuildContent();
                }
            } else if (subStage === "transition") {
                if (!isFinalSolution) {
                    const nextSolution = currentSolutionIndex + 1;
                    setCurrentSolutionIndex(nextSolution);
                    setCurrentStepIndex(0);
                    setIsNewSolution(true);
                    setIsFinalSolution(isLastSolution(nextSolution));
                    setIsFinalStep(false);
                    setSubStage("steps");
                    rebuildContent();
                } else {
                    setSubStage("finalStatement");
                    rebuildContent();
                }
            } else if (subStage === "finalStatement") {
                setShowCongratulations(true);
            }
        }
    };

    const previousStep = () => {
        if (stage === "intro") {
            setStage("overview");
            rebuildContent();
        } else if (stage === "solution") {
            if (subStage === "steps") {
                if (currentStepIndex > 0) {
                    setCurrentStepIndex(currentStepIndex - 1);
                    setIsFinalStep(false);
                    rebuildContent();
                } else {
                    setStage("intro");
                    setCurrentSolutionIndex(0);
                    setCurrentStepIndex(-1);
                    setIsNewSolution(true);
                    setIsFinalSolution(false);
                    setIsFinalStep(false);
                    rebuildContent();
                }
            } else if (subStage === "solutionAnswer") {
                setSubStage("steps");
                setCurrentStepIndex(solutions[currentSolutionIndex].steps.length - 1);
                setIsFinalStep(true);
                rebuildContent();
            } else if (subStage === "transition") {
                setSubStage("solutionAnswer");
                rebuildContent();
            } else if (subStage === "finalStatement") {
                if (hasTransitionText()) {
                    setSubStage("transition");
                } else {
                    setSubStage("solutionAnswer");
                }
                rebuildContent();
            }
        }
    };

    const reset = () => {
        setStage("overview");
        setSubStage("steps");
        setCurrentSolutionIndex(0);
        setCurrentStepIndex(-1);
        setIsNewSolution(true);
        setIsFinalSolution(false);
        setIsFinalStep(false);
        setShowCongratulations(false);
        // Rebuild content after state updates
        setTimeout(() => rebuildContent(), 0);
    };

    if (showCongratulations) {
        return (
            <div className="flex flex-col items-center justify-center h-full">
                <h2 className="text-2xl font-bold mb-4">Congratulations!</h2>
                <div className="space-x-4">
                    <Button onClick={reset}>Review Again</Button>
                    <Button onClick={() => router.push("/education/subjects/quick-math")}>Choose Another Lesson</Button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            <Card className="flex-grow overflow-y-auto overflow-x-hidden" ref={contentRef}>
                <CardContent className="p-2 sm:p-3 pb-20">
                    <div className="space-y-2 max-w-4xl mx-auto">
                        {displayedContent.map((content, index) => (
                            <motion.div
                                key={index}
                                ref={index === displayedContent.length - 1 ? lastContentRef : null}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.3 }}
                            >
                                {content}
                            </motion.div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            <ControlPanel onReset={reset} onBack={previousStep} onNext={nextStep} started={stage !== "overview"} />
        </div>
    );
};

export default MathProblemImpl;
