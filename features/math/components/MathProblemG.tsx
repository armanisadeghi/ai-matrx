'use client';

import React, {useState, useRef, useEffect, JSX} from 'react';
import {useRouter, useSearchParams} from 'next/navigation';
import DisplayMath from './DisplayMath';
import InlineMathText from './InlineMathText';
import {motion} from 'motion/react';
import {Card, CardContent} from '@/components/ui/card';
import ControlPanel from './ControlPanel';
import { BackgroundGradient } from "@/components/ui/background-gradient";
import SolutionAnswer from "./SolutionAnswer";
import { MathProblemProps } from '../types';

type FlowPosition = {
    stage: 'overview' | 'intro' | 'problem' | 'task' | 'step' | 'solutionAnswer' | 'transition' | 'finalStatement' | 'congratulations';
    solutionIndex?: number;
    stepIndex?: number;
    partIndex?: number; // For parts within a step
};

const MathProblem: React.FC<MathProblemProps> = (
    {
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
    const [currentPosition, setCurrentPosition] = useState<FlowPosition>({stage: 'overview'});
    const contentRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const parsePositionFromURL = (searchParams: URLSearchParams): FlowPosition => {
            const stage = searchParams.get('stage') as FlowPosition['stage'] || 'overview';
            const solutionIndex = searchParams.get('solutionIndex');
            const stepIndex = searchParams.get('stepIndex');
            const partIndex = searchParams.get('partIndex');

            const position: FlowPosition = {stage};

            if (solutionIndex !== null) position.solutionIndex = parseInt(solutionIndex);
            if (stepIndex !== null) position.stepIndex = parseInt(stepIndex);
            if (partIndex !== null) position.partIndex = parseInt(partIndex);

            return position;
        };

        const position = parsePositionFromURL(searchParams);
        setCurrentPosition(position);
    }, []);

    useEffect(() => {
        const serializePositionToURL = (position: FlowPosition): string => {
            const params = new URLSearchParams();
            params.set('stage', position.stage);
            if (position.solutionIndex !== undefined) params.set('solutionIndex', position.solutionIndex.toString());
            if (position.stepIndex !== undefined) params.set('stepIndex', position.stepIndex.toString());
            if (position.partIndex !== undefined) params.set('partIndex', position.partIndex.toString());
            return params.toString();
        };

        const urlParams = serializePositionToURL(currentPosition);
        router.push(`?${urlParams}`, {scroll: false});
    }, [currentPosition]);

    useEffect(() => {
        if (contentRef.current) {
            contentRef.current.scrollTop = contentRef.current.scrollHeight;
        }
    }, [currentPosition]);

    const getNextPosition = (position: FlowPosition): FlowPosition => {
        const totalSolutions = solutions.length;
        switch (position.stage) {
            case 'overview':
                return {stage: 'intro'};
            case 'intro':
                return {stage: 'problem'};
            case 'problem':
                return {stage: 'task', solutionIndex: 0};
            case 'task':
                return {stage: 'step', solutionIndex: position.solutionIndex!, stepIndex: 0, partIndex: 0};
            case 'step': {
                const currentSolution = solutions[position.solutionIndex!];
                const currentStep = currentSolution.steps[position.stepIndex!];
                const maxPartIndex = 3; // parts: title(0), equation(1), explanation(2), simplified(3)
                if (position.partIndex! < maxPartIndex) {
                    return {...position, partIndex: position.partIndex! + 1};
                } else if (position.stepIndex! < currentSolution.steps.length - 1) {
                    return {stage: 'step', solutionIndex: position.solutionIndex, stepIndex: position.stepIndex! + 1, partIndex: 0};
                } else {
                    return {stage: 'solutionAnswer', solutionIndex: position.solutionIndex};
                }
            }
            case 'solutionAnswer': {
                const transitionText = solutions[position.solutionIndex!].transitionText;
                if (transitionText) {
                    return {stage: 'transition', solutionIndex: position.solutionIndex};
                } else if (position.solutionIndex! < totalSolutions - 1) {
                    return {stage: 'task', solutionIndex: position.solutionIndex! + 1};
                } else {
                    return {stage: 'finalStatement'};
                }
            }
            case 'transition':
                if (position.solutionIndex! < totalSolutions - 1) {
                    return {stage: 'task', solutionIndex: position.solutionIndex! + 1};
                } else {
                    return {stage: 'finalStatement'};
                }
            case 'finalStatement':
                return {stage: 'congratulations'};
            case 'congratulations':
                return {stage: 'overview'};
            default:
                return {stage: 'overview'};
        }
    };

    const getPreviousPosition = (position: FlowPosition): FlowPosition => {
        const totalSolutions = solutions.length;
        switch (position.stage) {
            case 'overview':
                return position;
            case 'intro':
                return {stage: 'overview'};
            case 'problem':
                return {stage: 'intro'};
            case 'task':
                return {stage: 'problem'};
            case 'step':
                if (position.partIndex! > 0) {
                    return {...position, partIndex: position.partIndex! - 1};
                } else if (position.stepIndex! > 0) {
                    return {stage: 'step', solutionIndex: position.solutionIndex, stepIndex: position.stepIndex! - 1, partIndex: 3};
                } else {
                    return {stage: 'task', solutionIndex: position.solutionIndex};
                }
            case 'solutionAnswer': {
                const currentSolution = solutions[position.solutionIndex!];
                const lastStepIndex = currentSolution.steps.length - 1;
                return {stage: 'step', solutionIndex: position.solutionIndex, stepIndex: lastStepIndex, partIndex: 3};
            }
            case 'transition':
                return {stage: 'solutionAnswer', solutionIndex: position.solutionIndex};
            case 'finalStatement': {
                const lastSolutionIndex = totalSolutions - 1;
                const lastSolution = solutions[lastSolutionIndex];
                if (lastSolution.transitionText) {
                    return {stage: 'transition', solutionIndex: lastSolutionIndex};
                } else {
                    return {stage: 'solutionAnswer', solutionIndex: lastSolutionIndex};
                }
            }
            case 'congratulations':
                return {stage: 'finalStatement'};
            default:
                return {stage: 'overview'};
        }
    };

    const nextStep = () => {
        const nextPosition = getNextPosition(currentPosition);
        setCurrentPosition(nextPosition);
    };

    const previousStep = () => {
        const prevPosition = getPreviousPosition(currentPosition);
        setCurrentPosition(prevPosition);
    };

    const reset = () => {
        setCurrentPosition({stage: 'overview'});
    };

    const getDisplayedContent = (position: FlowPosition): JSX.Element[] => {
        const content: JSX.Element[] = [];

        if (position.stage === 'overview') {
            content.push(<h2 key="title" className="text-2xl font-bold mb-4"><InlineMathText text={title} /></h2>);
            content.push(
                <div key="overview" className="space-y-2 mb-4">
                    <p className="text-base">Course: {course_name}</p>
                    <p className="text-base">Topic: {topic_name}</p>
                    <p className="text-base">Module: {module_name}</p>
                    <p className="text-base"><InlineMathText text={description} /></p>
                </div>
            );
        }

        if (position.stage === 'intro' || position.stage !== 'overview') {
            content.push(<p key="introText" className="text-base"><InlineMathText text={intro_text} /></p>);
        }

        if (position.stage === 'problem' || ['task', 'step', 'solutionAnswer', 'transition', 'finalStatement', 'congratulations'].includes(position.stage)) {
            content.push(
                <div key="problemStatement" className="space-y-2">
                    <p className="text-base"><InlineMathText text={problem_statement.text} /></p>
                    <DisplayMath math={problem_statement.equation}/>
                    <p className="text-base"><InlineMathText text={problem_statement.instruction} /></p>
                </div>
            );
        }

        if (position.stage === 'task' || ['step', 'solutionAnswer', 'transition', 'finalStatement', 'congratulations'].includes(position.stage)) {
            const solutionIndex = position.solutionIndex!;
            content.push(<p key={`task-${solutionIndex}`} className="text-base"><InlineMathText text={solutions[solutionIndex].task} /></p>);
        }

        if (position.stage === 'step' || ['solutionAnswer', 'transition', 'finalStatement', 'congratulations'].includes(position.stage)) {
            const solutionIndex = position.solutionIndex!;
            const steps = solutions[solutionIndex].steps;
            for (let s = 0; s <= (position.stage === 'step' ? position.stepIndex! : steps.length - 1); s++) {
                const step = steps[s];
                content.push(<h4 key={`step-${s}-title`} className="font-semibold text-lg mt-4"><InlineMathText text={step.title} /></h4>);
                if (s < position.stepIndex! || (s === position.stepIndex! && position.partIndex! >= 1)) {
                    content.push(<DisplayMath key={`step-${s}-equation`} math={step.equation}/>);
                }
                if ((s < position.stepIndex! || (s === position.stepIndex! && position.partIndex! >= 2)) && step.explanation) {
                    content.push(<p key={`step-${s}-explanation`} className="text-base"><InlineMathText text={step.explanation} /></p>);
                }
                if ((s < position.stepIndex! || (s === position.stepIndex! && position.partIndex! >= 3)) && step.simplified) {
                    content.push(
                        <div key={`step-${s}-simplified`}>
                            <p className="text-base">Simplified:</p>
                            <DisplayMath math={step.simplified}/>
                        </div>
                    );
                }
            }
        }

        if (position.stage === 'solutionAnswer' || ['transition', 'finalStatement', 'congratulations'].includes(position.stage)) {
            const solutionIndex = position.solutionIndex!;
            content.push(
                <div key={`solutionAnswer-${solutionIndex}`} className="space-y-2 mt-4">
                    <h3 className="text-xl font-semibold">Final Answer</h3>
                    <SolutionAnswer answer={solutions[solutionIndex].solutionAnswer} />
                </div>
            );
        }

        if (position.stage === 'transition') {
            const solutionIndex = position.solutionIndex!;
            const transitionText = solutions[solutionIndex].transitionText;
            if (transitionText) {
                content.push(<p key={`transition-${solutionIndex}`} className="text-base"><InlineMathText text={transitionText} /></p>);
            }
        }

        if (position.stage === 'finalStatement') {
            content.push(<p key="finalStatement" className="mt-4 text-base"><InlineMathText text={final_statement} /></p>);
        }

        if (position.stage === 'congratulations') {
            content.push(
                <div key="congratulations" className="mt-4">
                    <h2 className="text-2xl font-bold mb-4">Congratulations!</h2>
                    <p className="text-base">You have completed the problem.</p>
                    {/* Add buttons or links for "Review Again" or "Choose Another Lesson" */}
                </div>
            );
        }

        return content;
    };

    const displayedContent = getDisplayedContent(currentPosition);

    return (
        <div className="flex flex-col h-full">
            <Card className="flex-grow overflow-y-auto" ref={contentRef}>
                <CardContent className="p-4">
                    <div className="space-y-4">
                        {displayedContent.map((content, index) => (
                            <motion.div
                                key={index}
                                initial={{opacity: 0, y: 20}}
                                animate={{opacity: 1, y: 0}}
                                transition={{duration: 0.3}}
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
                            <p><strong>Stage:</strong> {currentPosition.stage}</p>
                            <p><strong>Solution Index:</strong> {currentPosition.solutionIndex !== undefined ? currentPosition.solutionIndex : 'N/A'}</p>
                            <p><strong>Step Index:</strong> {currentPosition.stepIndex !== undefined ? currentPosition.stepIndex : 'N/A'}</p>
                            <p><strong>Part Index:</strong> {currentPosition.partIndex !== undefined ? currentPosition.partIndex : 'N/A'}</p>
                        </CardContent>
                    </Card>
                </BackgroundGradient>
            </div>
            <ControlPanel
                onReset={reset}
                onBack={previousStep}
                onNext={nextStep}
                started={currentPosition.stage !== 'overview'}
            />
        </div>
    );
};

export default MathProblem;
