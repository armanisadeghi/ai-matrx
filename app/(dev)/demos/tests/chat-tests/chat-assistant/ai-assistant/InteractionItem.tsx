import React from "react";
import { X, ChevronUp, ChevronDown, Clock, ArrowUp } from "lucide-react";
import {
  InteractionItemProps,
  isTextInteraction,
  isQuestionInteraction,
  isInputInteraction,
  isSliderInteraction,
  isCheckboxInteraction,
} from "./types";
import { formatTime } from "./hooks";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";

const InteractionItem: React.FC<InteractionItemProps> = ({
  interaction,
  expanded,
  toggleExpanded,
  handleAnswer,
  handleInputChange,
  handleSliderChange,
  handleCheckboxChange,
  moveToHistory,
}) => {
  // Reusable submit button component
  const SubmitButton = ({ onClick, disabled = false }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        w-6 h-6 rounded-full flex items-center justify-center
        ${
          disabled
            ? "bg-gray-300 text-gray-500 cursor-not-allowed"
            : "bg-indigo-600 hover:bg-indigo-700 text-white dark:bg-indigo-600 dark:hover:bg-indigo-500 shadow-sm"
        }
      `}
      title="Submit"
    >
      <ArrowUp size={14} />
    </button>
  );

  // Type-specific content rendering
  const renderContent = () => {
    if (isTextInteraction(interaction)) {
      const isExpandable = interaction.content.length > 80;
      const displayContent =
        isExpandable && !expanded
          ? `${interaction.content.substring(0, 80)}...`
          : interaction.content;

      return (
        <div className="mb-1">
          <p className="text-sm text-gray-700 dark:text-gray-200">
            {displayContent}
          </p>

          {/* Footer with inline controls */}
          <div className="flex justify-between items-center mt-2">
            {/* Show more/less button on the left */}
            <div>
              {isExpandable && (
                <button
                  onClick={() => toggleExpanded(interaction.id)}
                  className="text-xs flex items-center text-indigo-600 dark:text-indigo-400"
                >
                  {expanded ? (
                    <>
                      <ChevronUp size={14} className="mr-1" /> Show less
                    </>
                  ) : (
                    <>
                      <ChevronDown size={14} className="mr-1" /> Read more
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Submit button on the right */}
            <SubmitButton onClick={() => handleAnswer(interaction.id, true)} />
          </div>
        </div>
      );
    }

    if (isQuestionInteraction(interaction)) {
      return (
        <div>
          <p className="mb-2 text-sm text-gray-700 dark:text-gray-200">
            {interaction.content}
          </p>
          <div className="flex flex-wrap gap-1 mb-2">
            {interaction.options.map((option, index) => (
              <button
                key={index}
                onClick={() => handleAnswer(interaction.id, option)}
                className={`text-xs px-2 py-1 rounded 
                  bg-indigo-100 hover:bg-indigo-200 text-indigo-700
                  dark:bg-indigo-700 dark:hover:bg-indigo-600 dark:text-white 
                  ${interaction.answer === option ? "ring-2 ring-offset-2 ring-indigo-500" : ""}
                `}
              >
                {option}
              </button>
            ))}
          </div>
          <div className="flex justify-end">
            <SubmitButton
              onClick={() =>
                interaction.answer
                  ? handleAnswer(interaction.id, interaction.answer)
                  : null
              }
              disabled={!interaction.answer}
            />
          </div>
        </div>
      );
    }

    if (isInputInteraction(interaction)) {
      return (
        <div>
          <label className="block text-sm mb-1 text-gray-700 dark:text-gray-300">
            {interaction.label}
          </label>
          <div className="flex gap-2 max-w-full items-center">
            <input
              type="text"
              value={interaction.value || ""}
              onChange={(e) =>
                handleInputChange(interaction.id, e.target.value)
              }
              className="flex-grow min-w-0 px-2 py-1 text-sm rounded border 
                bg-white border-gray-300 text-gray-800
                dark:bg-gray-700 dark:border-gray-600 dark:text-white
                focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="Type..."
            />
            <SubmitButton
              onClick={() => handleAnswer(interaction.id, interaction.value)}
              disabled={!interaction.value}
            />
          </div>
        </div>
      );
    }

    if (isSliderInteraction(interaction)) {
      return (
        <div>
          <label className="block text-sm mb-1 text-gray-700 dark:text-gray-300">
            {interaction.label}
          </label>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs">{interaction.min}</span>
            <div className="flex-grow">
              <Slider
                defaultValue={[interaction.value || interaction.min]}
                min={interaction.min}
                max={interaction.max}
                step={1}
                onValueChange={(values) =>
                  handleSliderChange(interaction.id, values[0])
                }
              />
            </div>
            <span className="text-xs">{interaction.max}</span>
          </div>
          <div className="grid grid-cols-3 items-center mt-1">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {/* Optional Left content */}
            </span>
            <div className="flex justify-center">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {interaction.value || interaction.min}
              </span>
            </div>
            <div className="flex justify-end">
              <SubmitButton
                onClick={() => handleAnswer(interaction.id, interaction.value)}
              />
            </div>
          </div>
        </div>
      );
    }
    if (isCheckboxInteraction(interaction)) {
      return (
        <div>
          <p className="text-sm mb-1 text-gray-700 dark:text-gray-300">
            {interaction.label}
          </p>
          <div className="space-y-1 mb-2">
            {interaction.options.map((option, index) => (
              <label
                key={index}
                className="flex items-center gap-2 cursor-pointer py-0.5"
              >
                <Checkbox
                  checked={(interaction.selected || []).includes(option)}
                  onCheckedChange={(checked) =>
                    handleCheckboxChange(
                      interaction.id,
                      option,
                      checked === true,
                    )
                  }
                  className="shrink-0"
                />
                <span className="text-xs text-gray-700 dark:text-gray-300">
                  {option}
                </span>
              </label>
            ))}
          </div>
          <div className="flex justify-end">
            <SubmitButton
              onClick={() =>
                handleAnswer(interaction.id, interaction.selected || [])
              }
              disabled={(interaction.selected || []).length === 0}
            />
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="rounded-lg px-3 pt-1 pb-2 shadow-sm transition-all duration-300 transform bg-textured border-border relative">
      {/* Header row with timestamp and icons */}
      <div className="flex justify-between items-center mb-1">
        {/* Timestamp - only takes up space when there's a timestamp */}
        {interaction.timestamp && (
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {formatTime(interaction.timestamp)}
          </div>
        )}

        {/* Icons always align to the right */}
        <div className="ml-auto flex">
          <button
            onClick={() => moveToHistory(interaction.id)}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            title="Move to history"
          >
            <Clock size={14} />
          </button>
          <button
            onClick={() => moveToHistory(interaction.id)}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            title="Close"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Content based on interaction type */}
      {renderContent()}
    </div>
  );
};

export default InteractionItem;
