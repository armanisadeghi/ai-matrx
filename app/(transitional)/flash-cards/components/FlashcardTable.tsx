// File location: app\(authenticated)\tests\flash-cards\components\FlashcardTable.tsx

"use client";

import React from "react";
import { useSelector, useDispatch } from "react-redux";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Edit, Trash, Plus } from "lucide-react";
import { Flashcard } from "@/types/flashcards.types";
import { selectAllFlashcards } from "@/lib/redux/selectors/flashcardSelectors";
import {
  setCurrentIndex,
  deleteFlashcard,
  addFlashcard,
  updateFlashcard,
} from "@/lib/redux/slices/flashcardChatSlice";
import type { AppDispatch } from "@/lib/redux/store";

interface FlashcardTableProps {
  onEditCard: (card: Flashcard) => void;
}

const FlashcardTable: React.FC<FlashcardTableProps> = ({ onEditCard }) => {
  const dispatch = useDispatch<AppDispatch>();
  const cards = useSelector(selectAllFlashcards);

  const getPerformanceColor = (percentage: number, reviewCount: number) => {
    if (reviewCount === 0) return "text-gray-500";
    if (percentage >= 80) return "text-green-500";
    if (percentage >= 60) return "text-yellow-500";
    return "text-red-500";
  };

  const handleSelectCard = (index: number) => {
    dispatch(setCurrentIndex(index));
  };

  const handleDeleteCard = (cardId: string) => {
    dispatch(deleteFlashcard(cardId));
  };

  const handleAddCard = () => {
    const newCard: Flashcard = {
      id: Date.now().toString(), // temporary ID
      order: cards.length + 1,
      front: "New Question",
      back: "New Answer",
      example: "New Example",
      reviewCount: 0,
      correctCount: 0,
      incorrectCount: 0,
    };
    dispatch(addFlashcard(newCard));
  };

  const handleSaveEdit = (updatedCard: Flashcard) => {
    dispatch(updateFlashcard(updatedCard));
  };

  return (
    <div className="w-full max-w-4xl mt-12 overflow-x-auto">
      <Button onClick={handleAddCard} className="mb-4">
        <Plus className="mr-2 h-4 w-4" /> Add New Card
      </Button>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Question</TableHead>
            <TableHead>Review Count</TableHead>
            <TableHead>Correct</TableHead>
            <TableHead>Incorrect</TableHead>
            <TableHead>Percentage</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {cards.map((card, index) => {
            const percentage =
              card.reviewCount > 0
                ? (card.correctCount / card.reviewCount) * 100
                : 0;
            return (
              <TableRow
                key={card.order}
                className="cursor-pointer"
                onClick={() => handleSelectCard(index)}
              >
                <TableCell>{card.front}</TableCell>
                <TableCell>{card.reviewCount}</TableCell>
                <TableCell>{card.correctCount}</TableCell>
                <TableCell>{card.incorrectCount}</TableCell>
                <TableCell
                  className={getPerformanceColor(percentage, card.reviewCount)}
                >
                  {percentage.toFixed(1)}%
                </TableCell>
                <TableCell>
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditCard(card);
                    }}
                    variant="outline"
                    className="mr-2"
                  >
                    <Edit className="h-2 w-2" />
                  </Button>
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteCard(card.id);
                    }}
                    variant="destructive"
                  >
                    <Trash className="h-2 w-2" />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};

export default FlashcardTable;
