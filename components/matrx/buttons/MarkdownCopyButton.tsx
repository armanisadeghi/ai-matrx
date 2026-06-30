"use client";
import { useState, useRef, useEffect, lazy, Suspense } from "react";
import { copyToClipboard } from "./markdown-copy-utils";
import useOnClickOutside from "@/hooks/useOnClickOutside";
import {
  Copy,
  CheckCircle2,
  FileText,
  FileType2,
  Code,
  Brain,
} from "lucide-react";
import { FcGoogle } from "react-icons/fc";
import { FaMicrosoft } from "react-icons/fa";
import SuspenseLoader from "@/components/loaders/SuspenseLoader";

const HtmlPreviewModal = lazy(
  () => import("@/features/html-pages/components/HtmlPreviewModal"),
);

/**
 * Simple Copy Button Component
 */
export function SimpleCopyButton({
  markdownContent,
  label = "Copy",
  className = "",
}) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    const success = await copyToClipboard(markdownContent, {
      onSuccess: () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
    });
  };
  return (
    <button
      onClick={handleCopy}
      className={`flex items-center gap-2 px-3 py-1.5 rounded bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 ${className}`}
    >
      {copied ? (
        <>
          <CheckCircle2 className="w-4 h-4 text-green-500" />
          <span>Copied!</span>
        </>
      ) : (
        <>
          <Copy className="w-4 h-4" />
          <span>{label}</span>
        </>
      )}
    </button>
  );
}

/**
 * Markdown Format Copy Button
 */
export function MarkdownCopyButton({
  markdownContent,
  className = "",
  iconOnly = false,
}) {
  const [copied, setCopied] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState("below");
  // Inline style applied to the dropdown to keep it clamped inside the
  // viewport (important on mobile when the button isn't flush with a screen
  // edge — a plain `right-0` would push the menu off the left side).
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const [showHtmlModal, setShowHtmlModal] = useState(false);
  const [htmlContent, setHtmlContent] = useState("");
  const [htmlTitle, setHtmlTitle] = useState("");
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  // Close dropdown when clicking outside
  const dropdownRef = useOnClickOutside<HTMLDivElement>(() =>
    setShowOptions(false),
  );

  useEffect(() => {
    if (!showOptions || !buttonRef.current) return;

    const rect = buttonRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    setDropdownPosition(spaceBelow < 160 ? "above" : "below");

    // Horizontal clamp: the dropdown is absolutely positioned relative to the
    // button's wrapper. We compute a `left` offset (relative to the button's
    // left edge) that keeps the 224px-wide menu fully inside the viewport with
    // an 8px gutter on both sides.
    const dropdownWidth = 224; // min-w-56 = 14rem
    const gutter = 8;
    const viewportWidth = window.innerWidth;

    // Default anchor: right edge of the dropdown lines up with the right edge
    // of the button (the original `right-0` behavior).
    let desiredLeft = rect.right - dropdownWidth;

    // Clamp so the dropdown stays within [gutter, viewportWidth - gutter].
    const minLeft = gutter;
    const maxLeft = viewportWidth - dropdownWidth - gutter;
    const clampedLeft = Math.max(minLeft, Math.min(desiredLeft, maxLeft));

    // Convert viewport `left` back to an offset relative to the button's
    // positioned parent (the wrapping .relative div, which shares the button's
    // left edge).
    const offsetFromButton = clampedLeft - rect.left;
    setDropdownStyle({ left: `${offsetFromButton}px`, right: "auto" });
  }, [showOptions]);

  const handleRegularCopy = async () => {
    const success = await copyToClipboard(markdownContent, {
      isMarkdown: true,
      formatForGoogleDocs: false,
      onSuccess: () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
    });
    setShowOptions(false);
  };

  const handleGoogleDocsCopy = async () => {
    const success = await copyToClipboard(markdownContent, {
      isMarkdown: true,
      formatForGoogleDocs: true,
      onSuccess: () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
    });
    setShowOptions(false);
  };

  const handleHtmlPreview = async () => {
    await copyToClipboard(markdownContent, {
      isMarkdown: true,
      formatForWordPress: true,
      showHtmlPreview: true,
      onShowHtmlPreview: (html) => {
        setHtmlContent(html);
        setHtmlTitle("HTML Preview");
        setShowHtmlModal(true);
      },
      onSuccess: () => {},
    });
    setShowOptions(false);
  };

  const handleCopyWithThinking = async () => {
    const success = await copyToClipboard(markdownContent, {
      isMarkdown: true,
      formatForGoogleDocs: false,
      includeThinking: true,
      onSuccess: () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
    });
    setShowOptions(false);
  };

  return (
    <div className={`relative ${className}`}>
      {copied ? (
        <button
          aria-label="Copied"
          title="Copied!"
          className={
            iconOnly
              ? "flex items-center justify-center h-9 w-9 rounded bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300"
              : "flex items-center gap-2 px-3 py-1.5 rounded bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300"
          }
        >
          <CheckCircle2 className="w-4 h-4" />
          {!iconOnly && <span>Copied!</span>}
        </button>
      ) : (
        <>
          <button
            ref={buttonRef}
            onClick={() => setShowOptions(!showOptions)}
            aria-label="Copy"
            title="Copy"
            className={
              iconOnly
                ? "flex items-center justify-center h-9 w-9 rounded bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
                : "flex items-center gap-2 px-3 py-1.5 rounded bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
            }
          >
            <Copy className="w-4 h-4" />
            {!iconOnly && <span>Copy</span>}
          </button>
          {showOptions && (
            <div
              ref={dropdownRef}
              style={dropdownStyle}
              className={`absolute ${
                dropdownPosition === "above"
                  ? "bottom-full mb-1"
                  : "top-full mt-1"
              } min-w-56 bg-textured border-border rounded shadow-lg z-30`}
            >
              <button
                onClick={handleRegularCopy}
                className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 flex items-center"
              >
                <FileText className="h-4 w-4 mr-2" />
                Plain Text
              </button>
              <button
                onClick={handleGoogleDocsCopy}
                className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 flex items-center"
              >
                <FcGoogle className="h-4 w-4 mr-2" />
                Google Docs
              </button>
              <button
                onClick={handleGoogleDocsCopy}
                className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 flex items-center"
              >
                <FaMicrosoft className="h-4 w-4 mr-2 text-blue-500" />
                Microsoft Word
              </button>
              <button
                onClick={handleHtmlPreview}
                className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 flex items-center border-t border-gray-100 dark:border-gray-600"
              >
                <Code className="h-4 w-4 mr-2 text-green-600" />
                HTML
              </button>
              <button
                onClick={handleCopyWithThinking}
                className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 flex items-center border-t border-gray-100 dark:border-gray-600"
              >
                <Brain className="h-4 w-4 mr-2 text-purple-600" />
                Copy With Thinking
              </button>
            </div>
          )}
        </>
      )}

      {/* HTML Preview Modal */}
      <Suspense fallback={<SuspenseLoader />}>
        <HtmlPreviewModal
          isOpen={showHtmlModal}
          onClose={() => setShowHtmlModal(false)}
          htmlContent={htmlContent}
          title={htmlTitle}
        />
      </Suspense>
    </div>
  );
}

/**
 * Inline Copy Button with smart positioning
 */
export function InlineCopyButton({
  markdownContent,
  position = "top-right",
  size = "sm",
  className = "",
  tooltipText = "Copy to clipboard",
  isMarkdown = false,
  constrainToParent = false,
}) {
  const [copied, setCopied] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState("below");
  const [dropdownHorizontalAlign, setDropdownHorizontalAlign] =
    useState("right");
  const [showHtmlModal, setShowHtmlModal] = useState(false);
  const [htmlContent, setHtmlContent] = useState("");
  const [htmlTitle, setHtmlTitle] = useState("");
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  // Close dropdown when clicking outside
  const inlineDropdownRef = useOnClickOutside<HTMLDivElement>(() =>
    setShowOptions(false),
  );

  // Check viewport and parent constraints when showing options
  useEffect(() => {
    if (showOptions && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;

      // Vertical positioning: If space below is less than 100px, show dropdown above
      if (spaceBelow < 100) {
        setDropdownPosition("above");
      } else {
        setDropdownPosition("below");
      }

      // Horizontal positioning: Check if we need to constrain to parent
      if (constrainToParent) {
        // Find the closest parent with a defined boundary (usually the markdown container)
        const parent =
          buttonRef.current.closest(".space-y-4") ||
          buttonRef.current.parentElement;
        if (parent) {
          const parentRect = parent.getBoundingClientRect();
          const dropdownWidth = 224; // min-w-56 = 14rem = 224px

          // Calculate available space on both sides
          const spaceOnRight = parentRect.right - rect.right;
          const spaceOnLeft = rect.left - parentRect.left;

          // Determine best alignment based on available space
          if (spaceOnRight >= dropdownWidth) {
            setDropdownHorizontalAlign("right");
          } else if (spaceOnLeft >= dropdownWidth) {
            setDropdownHorizontalAlign("left");
          } else {
            // If dropdown doesn't fit on either side, align to the side with more space
            setDropdownHorizontalAlign(
              spaceOnRight >= spaceOnLeft ? "right" : "left",
            );
          }
        }
      } else {
        // Default behavior: align to right
        setDropdownHorizontalAlign("right");
      }
    }
  }, [showOptions, constrainToParent]);

  // Size mapping
  const sizeClasses = {
    xs: "h-4 w-4",
    sm: "h-5 w-5",
    md: "h-6 w-6",
    lg: "h-7 w-7",
    xl: "h-8 w-8",
  };

  // Position mapping
  const positionClasses = {
    "top-right": "absolute top-1 right-1",
    "top-left": "absolute top-1 left-1",
    "top-center": "absolute top-1 left-1/2 -translate-x-1/2",
    "bottom-right": "absolute bottom-1 right-1",
    "bottom-left": "absolute bottom-1 left-1",
    "bottom-center": "absolute bottom-1 left-1/2 -translate-x-1/2",
    "center-left": "absolute top-1/2 -translate-y-1/2 left-1",
    "center-right": "absolute top-1/2 -translate-y-1/2 right-1",
    center: "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
  };

  const handleMouseEnter = () => {
    setShowTooltip(true);
  };

  const handleMouseLeave = () => {
    setShowTooltip(false);
  };

  const handleButtonClick = () => {
    if (isMarkdown) {
      setShowOptions(!showOptions);
    } else {
      handleRegularCopy();
    }
  };

  const handleRegularCopy = async () => {
    await copyToClipboard(markdownContent, {
      isMarkdown,
      formatForGoogleDocs: false,
      onSuccess: () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
    });
    setShowOptions(false);
  };

  const handleGoogleDocsCopy = async () => {
    await copyToClipboard(markdownContent, {
      isMarkdown,
      formatForGoogleDocs: true,
      onSuccess: () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
    });
    setShowOptions(false);
  };

  const handleHtmlPreview = async () => {
    await copyToClipboard(markdownContent, {
      isMarkdown,
      formatForWordPress: true,
      showHtmlPreview: true,
      onShowHtmlPreview: (html) => {
        setHtmlContent(html);
        setHtmlTitle("HTML Preview");
        setShowHtmlModal(true);
      },
      onSuccess: () => {},
    });
    setShowOptions(false);
  };

  const handleCopyWithThinkingInline = async () => {
    await copyToClipboard(markdownContent, {
      isMarkdown,
      formatForGoogleDocs: false,
      includeThinking: true,
      onSuccess: () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
    });
    setShowOptions(false);
  };

  return (
    <div
      className={`${positionClasses[position]} ${className} inline-flex z-10`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        ref={buttonRef}
        onClick={handleButtonClick}
        className="bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800 p-1 rounded-md transition-colors duration-200 z-10"
        aria-label={tooltipText}
      >
        {copied ? (
          <CheckCircle2 className={`${sizeClasses[size]} text-green-500`} />
        ) : (
          <Copy
            className={`${sizeClasses[size]} text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200`}
          />
        )}
      </button>

      {/* Tooltip */}
      {showTooltip && !copied && !showOptions && (
        <div className="absolute top-full mt-1 right-0 bg-gray-800 text-white text-xs rounded py-1 px-2 whitespace-nowrap z-20">
          {tooltipText}
        </div>
      )}

      {copied && showTooltip && (
        <div className="absolute top-full mt-1 right-0 bg-green-600 text-white text-xs rounded py-1 px-2 whitespace-nowrap z-20">
          Copied!
        </div>
      )}

      {/* Smart positioning dropdown */}
      {showOptions && isMarkdown && (
        <div
          ref={inlineDropdownRef}
          className={`absolute ${
            dropdownPosition === "above" ? "bottom-full mb-1" : "top-full mt-1"
          } ${
            dropdownHorizontalAlign === "left" ? "left-0" : "right-0"
          } min-w-56 bg-textured border-border rounded shadow-lg z-30`}
        >
          <button
            onClick={handleRegularCopy}
            className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 flex items-center"
          >
            <FileText className="h-4 w-4 mr-2" />
            Plain Text
          </button>
          <button
            onClick={handleGoogleDocsCopy}
            className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 flex items-center"
          >
            <FcGoogle className="h-4 w-4 mr-2" />
            Google Docs
          </button>
          <button
            onClick={handleGoogleDocsCopy}
            className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 flex items-center"
          >
            <FaMicrosoft className="h-4 w-4 mr-2" />
            Microsoft Word
          </button>
          <button
            onClick={handleHtmlPreview}
            className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 flex items-center border-t border-gray-100 dark:border-gray-600"
          >
            <Code className="h-4 w-4 mr-2 text-green-600" />
            HTML
          </button>
          <button
            onClick={handleCopyWithThinkingInline}
            className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 flex items-center border-t border-gray-100 dark:border-gray-600"
          >
            <Brain className="h-4 w-4 mr-2 text-purple-600" />
            Copy With Thinking
          </button>
        </div>
      )}

      {/* HTML Preview Modal */}
      <Suspense fallback={<SuspenseLoader />}>
        <HtmlPreviewModal
          isOpen={showHtmlModal}
          onClose={() => setShowHtmlModal(false)}
          htmlContent={htmlContent}
          title={htmlTitle}
        />
      </Suspense>
    </div>
  );
}
