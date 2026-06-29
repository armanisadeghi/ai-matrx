'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import IconButton from '@/components/official/IconButton';
import { TooltipProvider } from '@/components/ui/tooltip';

// Extend Window interface for non-standard find API
declare global {
  interface Window {
    find(searchString: string, caseSensitive?: boolean, backwards?: boolean, wrapAround?: boolean): boolean;
  }
}
import { 
  Search, 
  X, 
  ChevronDown, 
  ChevronRight,
  ArrowDown,
  ArrowUp,
  CaseSensitive,
  Regex,
  WholeWord,
  Replace,
  ReplaceAll,
  Maximize2,
  Minimize2,
} from 'lucide-react';

interface FindReplaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetElement?: HTMLTextAreaElement | HTMLInputElement | null;
  onReplace?: (newText: string) => void;
}

export function FindReplaceModal({ isOpen, onClose, targetElement, onReplace }: FindReplaceModalProps) {
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [matches, setMatches] = useState<number[]>([]);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [showReplace, setShowReplace] = useState(false);
  const [searchScope, setSearchScope] = useState<'element' | 'page'>('element');
  const [targetContent, setTargetContent] = useState(''); // Track textarea content changes
  
  const findInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const isNavigatingRef = useRef(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Focus find input when opened - AGGRESSIVE to fight context menu restoration
  useEffect(() => {
    if (!isOpen) return;
    
    const focusInput = () => {
      if (findInputRef.current) {
        findInputRef.current.focus();
        findInputRef.current.select();
      }
    };
    
    // Multiple attempts at various intervals to ensure focus after context menu closes
    requestAnimationFrame(() => {
      focusInput();
      requestAnimationFrame(() => {
        focusInput();
        setTimeout(focusInput, 50);
        setTimeout(focusInput, 100);
        setTimeout(focusInput, 150);
        setTimeout(focusInput, 200);
        setTimeout(focusInput, 250);
      });
    });
  }, [isOpen]);

  // Auto-hide replace when switching to page mode
  useEffect(() => {
    if (searchScope === 'page' && showReplace) {
      setShowReplace(false);
    }
  }, [searchScope, showReplace]);

  // Track changes to textarea content to re-trigger search
  useEffect(() => {
    if (!isOpen || !targetElement || searchScope === 'page') return undefined;
    
    // Set initial content
    setTargetContent(targetElement.value);
    
    // Listen for input changes
    const handleInput = () => {
      setTargetContent(targetElement.value);
    };
    
    targetElement.addEventListener('input', handleInput);
    
    return () => {
      targetElement.removeEventListener('input', handleInput);
    };
  }, [isOpen, targetElement, searchScope]);


  // Find all matches when search text changes OR content changes (debounced)
  useEffect(() => {
    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    if (!findText) {
      setMatches([]);
      setCurrentIndex(-1);
      return undefined;
    }
    
    // Debounce search to allow user to finish typing
    searchTimeoutRef.current = setTimeout(() => {

    if (searchScope === 'element') {
      // Element-scoped search
      if (!targetElement) {
        setMatches([]);
        setCurrentIndex(-1);
        return;
      }

      const content = targetContent || targetElement.value;
      let foundMatches: number[] = [];

      try {
        if (useRegex) {
          const flags = caseSensitive ? 'g' : 'gi';
          const regex = new RegExp(findText, flags);
          let match;
          while ((match = regex.exec(content)) !== null) {
            foundMatches.push(match.index);
          }
        } else {
          const searchText = caseSensitive ? findText : findText.toLowerCase();
          const searchContent = caseSensitive ? content : content.toLowerCase();
          
          let index = 0;
          const searchTerm = wholeWord 
            ? new RegExp(`\\b${findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, caseSensitive ? 'g' : 'gi')
            : null;

          if (wholeWord && searchTerm) {
            let match;
            while ((match = searchTerm.exec(searchContent)) !== null) {
              foundMatches.push(match.index);
            }
          } else {
            while ((index = searchContent.indexOf(searchText, index)) !== -1) {
              foundMatches.push(index);
              index += searchText.length;
            }
          }
        }
      } catch (e) {
        // Invalid regex, ignore
      }

      setMatches(foundMatches);
      setCurrentIndex(foundMatches.length > 0 ? 0 : -1);

      // Highlight first match visually, but keep focus in search input
      // User can click Next/Previous arrows to actively navigate with focus
      if (foundMatches.length > 0 && targetElement) {
        targetElement.setSelectionRange(foundMatches[0], foundMatches[0] + findText.length);
      }
    } else {
      // Page-wide search - count matches in page text (excluding this modal)
      // Get all text nodes except from the find modal itself
      let pageText = '';
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: (node) => {
            // Exclude text from the find/replace modal
            let parent = node.parentElement;
            while (parent) {
              if (parent.classList && (
                parent.classList.contains('find-replace-modal') ||
                parent.hasAttribute('data-radix-dialog-content') ||
                parent.hasAttribute('data-radix-portal')
              )) {
                return NodeFilter.FILTER_REJECT;
              }
              parent = parent.parentElement;
            }
            return NodeFilter.FILTER_ACCEPT;
          }
        }
      );
      
      let node;
      while ((node = walker.nextNode())) {
        pageText += node.textContent;
      }
      
      const searchText = caseSensitive ? findText : findText.toLowerCase();
      const searchContent = caseSensitive ? pageText : pageText.toLowerCase();
      
      let foundMatches: number[] = [];
      let index = 0;
      
      while ((index = searchContent.indexOf(searchText, index)) !== -1) {
        foundMatches.push(index);
        index += searchText.length;
      }
      
      setMatches(foundMatches);
      setCurrentIndex(foundMatches.length > 0 ? 0 : -1);
      
      // DON'T use window.find here - it steals focus!
      // Only use it when user explicitly navigates with Next/Previous
    }
    }, 300); // 300ms debounce
    
    // Cleanup timeout on unmount or when dependencies change
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [findText, targetElement, targetContent, caseSensitive, useRegex, wholeWord, searchScope]);

  const handleNext = () => {
    if (searchScope === 'page') {
      // Update current index for page-wide search
      if (matches.length > 0) {
        const nextIndex = (currentIndex + 1) % matches.length;
        setCurrentIndex(nextIndex);
      }
      
      // Use browser's built-in find for highlighting
      if (window.find) {
        window.find(findText, caseSensitive, false, true); // Forward, wrap
      }
      return;
    }
    
    // Element-scoped search
    if (matches.length === 0 || !targetElement) return;
    
    const nextIndex = (currentIndex + 1) % matches.length;
    setCurrentIndex(nextIndex);
    
    const start = matches[nextIndex];
    const end = start + findText.length;
    
    // Focus the textarea and select the text
    targetElement.focus();
    targetElement.setSelectionRange(start, end);
    
    // Scroll the page to show the element if needed
    targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // Scroll within the textarea to show the selection
    if (targetElement instanceof HTMLTextAreaElement) {
      const textBeforeMatch = targetElement.value.substring(0, start);
      const lines = textBeforeMatch.split('\n').length;
      const lineHeight = parseInt(getComputedStyle(targetElement).lineHeight) || 20;
      const scrollTop = Math.max(0, (lines - 2) * lineHeight);
      targetElement.scrollTop = scrollTop;
    }
  };

  const handlePrevious = () => {
    if (searchScope === 'page') {
      // Update current index for page-wide search
      if (matches.length > 0) {
        const prevIndex = currentIndex === 0 ? matches.length - 1 : currentIndex - 1;
        setCurrentIndex(prevIndex);
      }
      
      // Use browser's built-in find for highlighting
      if (window.find) {
        window.find(findText, caseSensitive, true, true); // Backward, wrap
      }
      return;
    }
    
    // Element-scoped search
    if (matches.length === 0 || !targetElement) return;
    
    const prevIndex = currentIndex === 0 ? matches.length - 1 : currentIndex - 1;
    setCurrentIndex(prevIndex);
    
    const start = matches[prevIndex];
    const end = start + findText.length;
    
    // Focus the textarea and select the text
    targetElement.focus();
    targetElement.setSelectionRange(start, end);
    
    // Scroll the page to show the element if needed
    targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // Scroll within the textarea to show the selection
    if (targetElement instanceof HTMLTextAreaElement) {
      const textBeforeMatch = targetElement.value.substring(0, start);
      const lines = textBeforeMatch.split('\n').length;
      const lineHeight = parseInt(getComputedStyle(targetElement).lineHeight) || 20;
      const scrollTop = Math.max(0, (lines - 2) * lineHeight);
      targetElement.scrollTop = scrollTop;
    }
  };

  const handleReplaceOne = () => {
    if (!targetElement || currentIndex === -1 || !findText || matches.length === 0) return;

    const content = targetElement.value;
    const matchStart = matches[currentIndex];
    
    // Get the actual text to replace (handle regex matches)
    let matchLength = findText.length;
    if (useRegex) {
      try {
        const flags = caseSensitive ? 'g' : 'gi';
        const regex = new RegExp(findText, flags);
        const match = regex.exec(content.substring(matchStart));
        if (match) {
          matchLength = match[0].length;
        }
      } catch (e) {
        // Invalid regex
        return;
      }
    }
    
    const matchEnd = matchStart + matchLength;
    const newContent = content.substring(0, matchStart) + replaceText + content.substring(matchEnd);
    
    if (onReplace) {
      onReplace(newContent);
    } else {
      targetElement.value = newContent;
    }

    // Trigger re-search after a short delay to update matches
    setTimeout(() => {
      const lengthDiff = replaceText.length - matchLength;
      
      // Update remaining match positions
      const updatedMatches = matches
        .filter((_, idx) => idx !== currentIndex)
        .map(pos => pos > matchStart ? pos + lengthDiff : pos);
      
      setMatches(updatedMatches);
      
      // Move to next match or adjust current index
      if (updatedMatches.length > 0) {
        const nextIdx = Math.min(currentIndex, updatedMatches.length - 1);
        setCurrentIndex(nextIdx);
        const start = updatedMatches[nextIdx];
        targetElement.focus();
        targetElement.setSelectionRange(start, start + findText.length);
        
        // Scroll to show the next match
        if (targetElement instanceof HTMLTextAreaElement) {
          const textBeforeMatch = targetElement.value.substring(0, start);
          const lines = textBeforeMatch.split('\n').length;
          const lineHeight = parseInt(getComputedStyle(targetElement).lineHeight) || 20;
          const scrollTop = Math.max(0, (lines - 2) * lineHeight);
          targetElement.scrollTop = scrollTop;
        }
      } else {
        setCurrentIndex(-1);
      }
    }, 10);
  };

  const handleReplaceAll = () => {
    if (!targetElement || matches.length === 0 || !findText) return;

    let content = targetElement.value;
    let newContent: string;

    try {
      if (useRegex) {
        const flags = caseSensitive ? 'g' : 'gi';
        const regex = new RegExp(findText, flags);
        newContent = content.replace(regex, replaceText);
      } else if (wholeWord) {
        const regex = new RegExp(`\\b${findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, caseSensitive ? 'g' : 'gi');
        newContent = content.replace(regex, replaceText);
      } else {
        // Simple string replacement
        if (caseSensitive) {
          newContent = content.split(findText).join(replaceText);
        } else {
          const regex = new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
          newContent = content.replace(regex, replaceText);
        }
      }
    } catch (e) {
      // Invalid regex
      return;
    }

    if (onReplace) {
      onReplace(newContent);
    } else {
      targetElement.value = newContent;
    }

    // Clear matches after replace all
    setMatches([]);
    setCurrentIndex(-1);
  };

  const handleClose = () => {
    // Clear any page-wide highlights
    if (searchScope === 'page') {
      const selection = window.getSelection();
      selection?.removeAllRanges();
    }
    
    setFindText('');
    setReplaceText('');
    setMatches([]);
    setCurrentIndex(-1);
    setSearchScope('element'); // Reset to element scope
    onClose();
  };

  if (!isOpen) return null;

  return (
    <TooltipProvider>
      <div className="find-replace-modal fixed top-16 right-4 z-[100] bg-card border border-border rounded-lg shadow-lg w-[420px]">
        {/* Find Row */}
        <div className="flex items-center gap-1 p-2 border-b border-border">
          <IconButton
            icon={showReplace ? ChevronDown : ChevronRight}
            tooltip={showReplace ? "Hide Replace" : "Show Replace"}
            size="sm"
            onClick={() => setShowReplace(!showReplace)}
            disabled={searchScope === 'page'} // Replace not supported in page mode
          />
          
          <div className="flex-1 relative">
            <Input
              ref={findInputRef}
              value={findText}
              onChange={(e) => setFindText(e.target.value)}
              placeholder="Find"
              className="h-7 text-sm pr-20"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault(); // Prevent default to stop it from bubbling to textarea
                  e.stopPropagation();
                  e.shiftKey ? handlePrevious() : handleNext();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  handleClose();
                }
              }}
            />
            {findText && (
              <div className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                {matches.length > 0 
                  ? `${currentIndex + 1}/${matches.length}` 
                  : 'No results'
                }
              </div>
            )}
          </div>

          <IconButton
            icon={ArrowUp}
            tooltip="Previous Match (Shift+Enter)"
            size="sm"
            onClick={handlePrevious}
            disabled={searchScope === 'element' && matches.length === 0}
          />
          
          <IconButton
            icon={ArrowDown}
            tooltip="Next Match (Enter)"
            size="sm"
            onClick={handleNext}
            disabled={searchScope === 'element' && matches.length === 0}
          />

          <div className="w-px h-5 bg-border" />

          <IconButton
            icon={CaseSensitive}
            tooltip="Match Case"
            size="sm"
            variant={caseSensitive ? "default" : "ghost"}
            onClick={() => setCaseSensitive(!caseSensitive)}
          />

          <IconButton
            icon={WholeWord}
            tooltip="Match Whole Word"
            size="sm"
            variant={wholeWord ? "default" : "ghost"}
            onClick={() => setWholeWord(!wholeWord)}
            disabled={searchScope === 'page'} // Not supported in page mode
          />

          <IconButton
            icon={Regex}
            tooltip="Use Regular Expression"
            size="sm"
            variant={useRegex ? "default" : "ghost"}
            onClick={() => setUseRegex(!useRegex)}
            disabled={searchScope === 'page'} // Regex not supported in page mode
          />

          <div className="w-px h-5 bg-border" />

          <IconButton
            icon={searchScope === 'page' ? Minimize2 : Maximize2}
            tooltip={searchScope === 'page' ? "Search in Element Only" : "Search Entire Page"}
            size="sm"
            variant={searchScope === 'page' ? "default" : "ghost"}
            onClick={() => setSearchScope(searchScope === 'page' ? 'element' : 'page')}
          />

          <div className="w-px h-5 bg-border" />

          <IconButton
            icon={X}
            tooltip="Close (Esc)"
            size="sm"
            onClick={handleClose}
          />
        </div>

        {/* Replace Row */}
        {showReplace && (
          <div className="flex items-center gap-1 p-2">
            <div className="w-6" /> {/* Spacer for alignment */}
            
            <div className="flex-1">
              <Input
                ref={replaceInputRef}
                value={replaceText}
                onChange={(e) => setReplaceText(e.target.value)}
                placeholder="Replace"
                className="h-7 text-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault(); // Prevent default to stop it from bubbling to textarea
                    e.stopPropagation();
                    e.shiftKey ? handleReplaceAll() : handleReplaceOne();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    handleClose();
                  }
                }}
              />
            </div>

            <IconButton
              icon={Replace}
              tooltip="Replace (Enter)"
              size="sm"
              onClick={handleReplaceOne}
              disabled={currentIndex === -1}
            />

            <IconButton
              icon={ReplaceAll}
              tooltip="Replace All (Shift+Enter)"
              size="sm"
              onClick={handleReplaceAll}
              disabled={matches.length === 0}
            />

            {/* Empty space to align with find row */}
            <div className="w-[108px]" />
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

