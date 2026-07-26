'use client'

import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {Flashcard, FlashcardData} from "@/types/flashcards.types";

interface EditFlashcardDialogProps {
    editingCard: Flashcard | null;
    onSave: (updatedCard: Flashcard) => void;
    onClose: () => void;
}

const EditFlashcardDialog: React.FC<EditFlashcardDialogProps> = ({ editingCard, onSave, onClose }) => {
    const [updatedCard, setUpdatedCard] = React.useState<Flashcard | null>(editingCard);

    React.useEffect(() => {
        setUpdatedCard(editingCard);
    }, [editingCard]);

    const handleInputChange = (field: keyof Flashcard, value: string) => {
        if (updatedCard) {
            setUpdatedCard({ ...updatedCard, [field]: value });
        }
    };

    const handleSave = () => {
        if (updatedCard) {
            onSave(updatedCard);
        }
    };

    return (
        <Dialog open={editingCard !== null} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Edit Flashcard</DialogTitle>
                </DialogHeader>
                {updatedCard && (
                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="front">Front of card</Label>
                            <Textarea
                                id="front"
                                value={updatedCard.front}
                                onChange={(e) => handleInputChange('front', e.target.value)}
                                placeholder="Front of card"
                            />
                        </div>
                        <div>
                            <Label htmlFor="back">Back of card</Label>
                            <Textarea
                                id="back"
                                value={updatedCard.back}
                                onChange={(e) => handleInputChange('back', e.target.value)}
                                placeholder="Back of card"
                            />
                        </div>
                        <div>
                            <Label htmlFor="example">Example</Label>
                            <Textarea
                                id="example"
                                value={updatedCard.example}
                                onChange={(e) => handleInputChange('example', e.target.value)}
                                placeholder="Example"
                            />
                        </div>
                        {updatedCard.topic && (
                            <div>
                                <Label htmlFor="topic">Topic</Label>
                                <Input
                                    id="topic"
                                    value={updatedCard.topic}
                                    onChange={(e) => handleInputChange('topic', e.target.value)}
                                    placeholder="Topic"
                                />
                            </div>
                        )}
                        {updatedCard.lesson && (
                            <div>
                                <Label htmlFor="lesson">Lesson</Label>
                                <Input
                                    id="lesson"
                                    value={updatedCard.lesson}
                                    onChange={(e) => handleInputChange('lesson', e.target.value)}
                                    placeholder="Lesson"
                                />
                            </div>
                        )}
                        {updatedCard.detailedExplanation && (
                            <div>
                                <Label htmlFor="detailedExplanation">Detailed Explanation</Label>
                                <Textarea
                                    id="detailedExplanation"
                                    value={updatedCard.detailedExplanation}
                                    onChange={(e) => handleInputChange('detailedExplanation', e.target.value)}
                                    placeholder="Detailed Explanation"
                                />
                            </div>
                        )}
                        {updatedCard.relatedImages && (
                            <div>
                                <Label htmlFor="relatedImages">Related Images</Label>
                                <Input
                                    id="relatedImages"
                                    value={updatedCard.relatedImages}
                                    onChange={(e) => handleInputChange('relatedImages', e.target.value)}
                                    placeholder="Related Images"
                                />
                            </div>
                        )}
                        <div>
                            <Label htmlFor="personalNotes">Personal Notes</Label>
                            <Textarea
                                id="personalNotes"
                                value={updatedCard.personalNotes || ''}
                                onChange={(e) => handleInputChange('personalNotes', e.target.value)}
                                placeholder="Add your personal notes here"
                            />
                        </div>
                        <Button onClick={handleSave}>Save Changes</Button>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
};

export default EditFlashcardDialog;