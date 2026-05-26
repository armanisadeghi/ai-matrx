"use client";

import React, { useState } from 'react';
import { Copy, CornerDownLeft, X, RotateCcw } from 'lucide-react';

export default function AIResponseDemo() {
  const [showToast, setShowToast] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hoveredAction, setHoveredAction] = useState(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const aiResponse = `I've created both UI patterns for you:

1. **Toast Style** - A sleek notification that slides in from the bottom-right corner, perfect for quick AI responses that don't need interaction

2. **VS Code Style Overlay** - A minimal, centered overlay with VS Code's dark theme aesthetic, featuring:
   - Clean header with AI branding
   - Monospace font for the response
   - Action buttons: Copy, Insert, Retry, and Cancel
   - Subtle hover states and transitions
   - Backdrop blur for focus

The VS Code overlay uses authentic VS Code colors (\`#1e1e1e\` background, \`#d4d4d4\` text) and follows their minimalist design language. Both components are fully functional with proper state management!`;

  const handleCopy = () => {
    navigator.clipboard.writeText(aiResponse);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const renderMarkdown = (text) => {
    return text.split('\n').map((line, i) => {
      // Bold
      line = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      // Inline code
      line = line.replace(/`(.*?)`/g, '<code class="bg-[#1e1e1e] px-1 rounded text-[#ce9178]">$1</code>');
      
      return (
        <div key={i} dangerouslySetInnerHTML={{ __html: line || '<br/>' }} />
      );
    });
  };

  const stripMarkdown = (text) => {
    return text
      .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold
      .replace(/`(.*?)`/g, '$1') // Remove inline code
      .replace(/^[\d]+\.\s/gm, '') // Remove numbered list markers
      .replace(/^[\s]*-\s/gm, '') // Remove bullet points
      .trim();
  };

  const handleMouseDown = (e) => {
    if (e.target.closest('button')) return; // Don't drag when clicking buttons
    
    setIsDragging(true);
    const rect = e.currentTarget.getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    
    setPosition({
      x: e.clientX - dragOffset.x,
      y: e.clientY - dragOffset.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  React.useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, dragOffset]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <h1 className="text-2xl font-semibold text-slate-900 mb-6">AI Response UI Patterns</h1>
          
          <div className="space-y-4">
            <button
              onClick={() => setShowToast(true)}
              className="px-4 py-2 bg-slate-900 text-white rounded-md hover:bg-slate-800 transition-colors"
            >
              Show Toast Style
            </button>
            
            <button
              onClick={() => setShowOverlay(true)}
              className="ml-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              Show VS Code Style Overlay
            </button>
          </div>
        </div>

        {/* Toast Style */}
        {showToast && (
          <div className="fixed bottom-4 right-4 bg-slate-900 text-white px-4 py-3 rounded-lg shadow-lg max-w-md animate-in slide-in-from-bottom-5 duration-300">
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <div className="text-xs font-medium text-slate-400 mb-1">AI Response</div>
                <div className="text-sm">{stripMarkdown(aiResponse)}</div>
              </div>
              <button
                onClick={() => setShowToast(false)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* VS Code Style Overlay */}
        {showOverlay && (
          <div 
            className="fixed w-full max-w-2xl animate-in zoom-in-95 duration-200"
            style={{
              left: position.x || '50%',
              top: position.y || '50%',
              transform: position.x ? 'none' : 'translate(-50%, -50%)',
              cursor: isDragging ? 'grabbing' : 'grab',
              zIndex: 1000
            }}
            onMouseDown={handleMouseDown}
          >
            <div className="bg-[#1e1e1e] text-[#d4d4d4] rounded-md shadow-2xl border border-[#3e3e42] overflow-hidden">
              {/* Content */}
              <div className="px-3 py-2 text-sm leading-relaxed select-none">
                {renderMarkdown(aiResponse)}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-0.5 px-1.5 py-1.5 bg-[#252526]">
                <div className="relative">
                  <button
                    onMouseEnter={() => setHoveredAction('copy')}
                    onMouseLeave={() => setHoveredAction(null)}
                    onClick={handleCopy}
                    className="p-1.5 text-[#cccccc] hover:bg-[#2a2d2e] rounded transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  {hoveredAction === 'copy' && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-[#2d2d30] text-[#cccccc] text-xs rounded shadow-lg whitespace-nowrap">
                      {copied ? 'Copied!' : 'Copy'}
                    </div>
                  )}
                </div>
                
                <div className="relative">
                  <button
                    onMouseEnter={() => setHoveredAction('insert')}
                    onMouseLeave={() => setHoveredAction(null)}
                    onClick={() => {
                      setShowOverlay(false);
                      alert('Insert action triggered');
                    }}
                    className="p-1.5 text-[#cccccc] hover:bg-[#2a2d2e] rounded transition-colors"
                  >
                    <CornerDownLeft className="w-3.5 h-3.5" />
                  </button>
                  {hoveredAction === 'insert' && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-[#2d2d30] text-[#cccccc] text-xs rounded shadow-lg whitespace-nowrap">
                      Insert
                    </div>
                  )}
                </div>
                
                <div className="relative">
                  <button
                    onMouseEnter={() => setHoveredAction('retry')}
                    onMouseLeave={() => setHoveredAction(null)}
                    onClick={() => alert('Retry action triggered')}
                    className="p-1.5 text-[#cccccc] hover:bg-[#2a2d2e] rounded transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                  {hoveredAction === 'retry' && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-[#2d2d30] text-[#cccccc] text-xs rounded shadow-lg whitespace-nowrap">
                      Retry
                    </div>
                  )}
                </div>
                
                <div className="flex-1" />
                
                <div className="relative">
                  <button
                    onMouseEnter={() => setHoveredAction('cancel')}
                    onMouseLeave={() => setHoveredAction(null)}
                    onClick={() => setShowOverlay(false)}
                    className="p-1.5 text-[#858585] hover:text-[#cccccc] hover:bg-[#2a2d2e] rounded transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                  {hoveredAction === 'cancel' && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-[#2d2d30] text-[#cccccc] text-xs rounded shadow-lg whitespace-nowrap">
                      Cancel
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}