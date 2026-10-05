import { Button } from "@/components/ui/button";
import { CardFooter } from "@/components/ui/card";
import { CheckCircle, XCircle, MessageSquare } from 'lucide-react';

interface FlashcardFooterProps {
    onAnswer: (correct: boolean) => void;
    onAskQuestion: () => void;
}

export const FlashcardFooter = ({ onAnswer, onAskQuestion }: FlashcardFooterProps) => (
    <CardFooter className="flex justify-between p-2 absolute bottom-0 left-0 right-0">
        <Button
            icon={<XCircle className="sm:flex hidden"/>}
            onClick={(e) => {
                e.stopPropagation();
                onAnswer(false);
            }}
            variant="danger"
        >
            <XCircle className="h-4 w-4 sm:hidden flex"/>
            <span className="sm:inline hidden">Incorrect</span>
        </Button>
        <Button
            icon={<MessageSquare className="sm:flex hidden"/>}
            onClick={(e) => {
                e.stopPropagation();
                onAskQuestion();
            }}
            variant="outline"
        >
            <MessageSquare className="h-4 w-4 sm:hidden flex"/>
            <span className="sm:inline hidden">Ask a Question</span>
        </Button>
        <Button
            icon={<CheckCircle className="sm:flex hidden"/>}
            onClick={(e) => {
                e.stopPropagation();
                onAnswer(true);
            }}
            variant="primary"
        >
            <CheckCircle className="h-4 w-4 sm:hidden flex"/>
            <span className="sm:inline hidden">Correct</span>
        </Button>
    </CardFooter>
);
