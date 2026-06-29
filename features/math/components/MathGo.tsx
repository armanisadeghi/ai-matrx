"use client";

import React, { useState, useRef, useEffect, JSX } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import "katex/dist/katex.min.css";
import { BlockMath } from "react-katex";
import { motion } from "motion/react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MathProblemProps } from "../types";
import ControlPanel from "./ControlPanel";
import { BackgroundGradient } from "@/components/ui/background-gradient";
import SolutionAnswer from "./SolutionAnswer";

const MathProblem: React.FC<MathProblemProps> = ({
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
    const searchParams = useSearchParams();
    const [stage, setStage] = useState<"overview" | "intro" | "solution">("overview");
    const [subStage, setSubStage] = useState<"steps" | "finalAnswer" | "transition" | "finalStatement">("steps");
    const [currentSolution, setCurrentSolution] = useState(0);
    const [currentStep, setCurrentStep] = useState(-1);
    const [displayedContent, setDisplayedContent] = useState<JSX.Element[]>([]);
    const [showCongratulations, setShowCongratulations] = useState(false);

    const contentRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const savedStage = searchParams.get("stage") || "overview";
        const savedSubStage = searchParams.get("subStage") || "steps";
        const savedSolution = parseInt(searchParams.get("solution") || "0");
        const savedStep = parseInt(searchParams.get("step") || "-1");

        setStage(savedStage as any);
        setSubStage(savedSubStage as any);
        setCurrentSolution(savedSolution);
        setCurrentStep(savedStep);

        rebuildContent(savedStage as any, savedSubStage as any, savedSolution, savedStep);
    }, []);

    useEffect(() => {
        if (contentRef.current) {
            contentRef.current.scrollTop = contentRef.current.scrollHeight;
        }
    }, [displayedContent]);

    useEffect(() => {
        const params = new URLSearchParams();
        params.set("stage", stage);
        params.set("subStage", subStage);
        params.set("solution", currentSolution.toString());
        params.set("step", currentStep.toString());
        router.push(`?${params.toString()}`, { scroll: false });
    }, [stage, subStage, currentSolution, currentStep]);

    const addContent = (content: JSX.Element) => {
        setDisplayedContent((prev) => [...prev, content]);
    };

    const rebuildContent = (currentStage: string, currentSubStage: string, solutionIndex: number, stepIndex: number) => {
        setDisplayedContent([]);

        if (currentStage === "overview") {
            addContent(
                <div key="overview" className="space-y-2">
                    <h2 className="text-2xl font-bold mb-4">{title}</h2>
                    <p className="text-base">Course: {course_name}</p>
                    <p className="text-base">Topic: {topic_name}</p>
                    <p className="text-base">Module: {module_name}</p>
                    <p className="text-base">{description}</p>
                </div>
            );
            return;
        }

        if (currentStage === "intro") {
            addContent(
                <p key="intro" className="text-base mb-4">
                    {intro_text}
                </p>
            );
        }

        if (currentStage === "intro" || currentStage === "solution") {
            addContent(
                <div key="problem-statement" className="space-y-2 mb-4">
                    <p className="text-base">{problem_statement.text}</p>
                    <BlockMath math={problem_statement.equation} />
                    <p className="text-base">{problem_statement.instruction}</p>
                </div>
            );
        }

        if (currentStage === "solution") {
            const solution = solutions[solutionIndex];
            addContent(
                <p key={`task-${solutionIndex}`} className="text-base mb-4">
                    {solution.task}
                </p>
            );

            if (currentSubStage === "steps" && stepIndex >= 0) {
                solution.steps.slice(0, stepIndex + 1).forEach((step, i) => {
                    addContent(
                        <div key={`step-${solutionIndex}-${i}`} className="mb-4">
                            <h4 className="font-semibold text-lg">{step.title}</h4>
                            <BlockMath math={step.equation} />
                            {step.explanation && <p className="text-base">{step.explanation}</p>}
                        </div>
                    );
                });
            } else if (currentSubStage === "finalAnswer") {
                addContent(
                    <div key={`final-answer-${solutionIndex}`} className="space-y-2 mt-4">
                        <h3 className="text-xl font-semibold">Final Answer</h3>
                        <SolutionAnswer answer={solution.solutionAnswer} />
                    </div>
                );
            } else if (currentSubStage === "transition" && solution.transitionText) {
                addContent(
                    <p key={`transition-${solutionIndex}`} className="text-base">
                        {solution.transitionText}
                    </p>
                );
            } else if (currentSubStage === "finalStatement") {
                addContent(
                    <p key="final-statement" className="text-base">
                        {final_statement}
                    </p>
                );
            }
        }
    };

    const nextStep = () => {
        if (stage === "overview") {
            setStage("intro");
        } else if (stage === "intro") {
            setStage("solution");
            setSubStage("steps");
            setCurrentStep(0);
        } else if (stage === "solution") {
            handleSolutionForwardTransition();
        }

        rebuildContent(stage, subStage, currentSolution, currentStep);
    };

    const handleSolutionForwardTransition = () => {
        const solution = solutions[currentSolution];

        if (subStage === "steps") {
            if (currentStep < solution.steps.length - 1) {
                setCurrentStep(currentStep + 1);
            } else {
                setSubStage("finalAnswer");
            }
        } else if (subStage === "finalAnswer") {
            if (solution.transitionText) {
                setSubStage("transition");
            } else if (currentSolution < solutions.length - 1) {
                setCurrentSolution(currentSolution + 1);
                setSubStage("steps");
                setCurrentStep(0);
            } else {
                setSubStage("finalStatement");
            }
        } else if (subStage === "transition") {
            if (currentSolution < solutions.length - 1) {
                setCurrentSolution(currentSolution + 1);
                setSubStage("steps");
                setCurrentStep(0);
            } else {
                setSubStage("finalStatement");
            }
        } else if (subStage === "finalStatement") {
            setShowCongratulations(true);
        }
    };

    const previousStep = () => {
        if (stage === "intro") {
            setStage("overview");
        } else if (stage === "solution") {
            handleSolutionBackwardTransition();
        }

        rebuildContent(stage, subStage, currentSolution, currentStep);
    };

    const handleSolutionBackwardTransition = () => {
        if (subStage === "steps") {
            if (currentStep > 0) {
                setCurrentStep(currentStep - 1);
            } else {
                setStage("intro");
            }
        } else if (subStage === "finalAnswer") {
            setSubStage("steps");
            setCurrentStep(solutions[currentSolution].steps.length - 1);
        } else if (subStage === "transition") {
            setSubStage("finalAnswer");
        } else if (subStage === "finalStatement") {
            if (solutions[currentSolution].transitionText) {
                setSubStage("transition");
            } else {
                setSubStage("finalAnswer");
            }
        }
    };

    const reset = () => {
        setStage("overview");
        setSubStage("steps");
        setCurrentSolution(0);
        setCurrentStep(-1);
        setShowCongratulations(false);
        rebuildContent("overview", "steps", 0, -1);
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
            <Card className="flex-grow overflow-y-auto" ref={contentRef}>
                <CardContent className="p-4">
                    <div className="space-y-4">
                        {displayedContent.map((content, index) => (
                            <motion.div
                                key={index}
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
            <div className="flex justify-center">
                <BackgroundGradient className="w-full max-w-lg p-4 sm:p-10 bg-white dark:bg-zinc-900 rounded-[22px]">
                    <Card>
                        <CardContent className="p-1">
                            <h3 className="text-xl font-semibold mb-2">Debug Information</h3>
                            <p>
                                <strong>Stage:</strong> {stage}
                            </p>
                            <p>
                                <strong>Sub-Stage:</strong> {subStage}
                            </p>
                            <p>
                                <strong>Current Solution:</strong> {currentSolution}
                            </p>
                            <p>
                                <strong>Current Step:</strong> {currentStep}
                            </p>
                            <p>
                                <strong>Displayed Content Count:</strong> {displayedContent.length}
                            </p>
                            <p>
                                <strong>Show Congratulations:</strong> {showCongratulations ? "Yes" : "No"}
                            </p>
                        </CardContent>
                    </Card>
                </BackgroundGradient>
            </div>
            <ControlPanel onReset={reset} onBack={previousStep} onNext={nextStep} started={stage !== "overview"} />
        </div>
    );
};

export default MathProblem;
