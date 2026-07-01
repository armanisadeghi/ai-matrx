// File Location: components/rich-text-editor/MarkdownDualDisplay.tsx

"use client";

import React, { useState, useCallback, useRef } from 'react';
import 'remirror/styles/all.css';
import './remirror-editor.css';
import { Remirror, useRemirror, EditorComponent, useCommands } from '@remirror/react';
import { MarkdownExtension } from 'remirror/extensions';
import { motion, MotionStyle } from 'motion/react';
import { useThemeMode } from '@/styles/themes/useThemeMode';
import { Type } from 'lucide-react';

const EditorContent: React.FC = () => {
  const commands = useCommands();
  const editorRef = useRef<HTMLDivElement>(null);

  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // Focus editor when clicking anywhere in the container
    commands.focus();
  }, [commands]);

  return (
    <div 
      ref={editorRef}
      onClick={handleClick}
      className="remirror-editor remirror-editor-clickable w-full h-full bg-background"
    >
      <EditorComponent />
    </div>
  );
};

const MarkdownDualDisplay: React.FC = () => {
  const [markdown, setMarkdown] = useState('');
  const [splitRatio, setSplitRatio] = useState(0.5);
  const [lineSpacing, setLineSpacing] = useState(1);
  const [showSpacingMenu, setShowSpacingMenu] = useState(false);
  const mode = useThemeMode();
  const { manager, state, onChange } = useRemirror({
    extensions: () => [new MarkdownExtension({})],
    content: markdown,
    stringHandler: 'markdown',
  });

  const handleChange = useCallback(() => {
    const newMarkdown = manager.store.helpers.getMarkdown();
    setMarkdown(newMarkdown);
  }, [manager.store.helpers]);

  const handleResize = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const startX = e.clientX;
    const startRatio = splitRatio;

    const doDrag = (e: MouseEvent) => {
      const containerWidth = window.innerWidth;
      const newRatio = startRatio + (e.clientX - startX) / containerWidth;
      setSplitRatio(Math.max(0.2, Math.min(0.8, newRatio)));
    };

    const stopDrag = () => {
      document.removeEventListener('mousemove', doDrag);
      document.removeEventListener('mouseup', stopDrag);
    };

    document.addEventListener('mousemove', doDrag);
    document.addEventListener('mouseup', stopDrag);
  }, [splitRatio]);

  return (
      <motion.div
          className="flex flex-col sm:flex-row w-full h-[calc(100dvh-4rem)] bg-background shadow-lg rounded-lg overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          data-theme={mode}
      >
        <div className="w-full sm:w-1/2 h-1/2 sm:h-full relative" style={{ flex: splitRatio }}>
          {/* Line Spacing Control */}
          <div className="absolute top-2 right-2 z-10">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="p-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 focus:ring-1 focus:ring-primary/50 transition-colors flex items-center gap-1 shadow-md"
              onClick={() => setShowSpacingMenu(!showSpacingMenu)}
            >
              <Type size={16} />
              <span className="text-sm">{lineSpacing}x</span>
            </motion.button>
            
            {showSpacingMenu && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute top-full mt-1 right-0 bg-background border border-border rounded-md shadow-lg z-10 min-w-[80px]"
              >
                {[1, 1.5, 2].map((spacing) => (
                  <button
                    key={spacing}
                    className={`w-full px-3 py-2 text-sm text-left hover:bg-muted transition-colors ${
                      lineSpacing === spacing ? 'bg-muted font-semibold' : ''
                    }`}
                    onClick={() => {
                      setLineSpacing(spacing);
                      setShowSpacingMenu(false);
                    }}
                  >
                    {spacing}x
                  </button>
                ))}
              </motion.div>
            )}
          </div>
          
          <Remirror
              manager={manager}
              initialContent={state}
              onChange={handleChange}
              autoFocus
          >
            <div 
              className="remirror-editor-wrapper w-full h-full border-r border-border focus-within:ring-1 focus-within:ring-primary/50 transition-shadow overflow-auto bg-background"
              style={{ '--editor-line-height': lineSpacing } as React.CSSProperties}
              data-theme={mode}
            >
              <EditorContent />
            </div>
          </Remirror>
        </div>
        <div
            className="w-1 h-1 sm:h-full bg-muted cursor-col-resize sm:cursor-ew-resize"
            onMouseDown={handleResize}
        />
        <Preview
            markdown={markdown}
            style={{ flex: 1 - splitRatio } as MotionStyle}
        />
      </motion.div>
  );
};

const Preview: React.FC<{ markdown: string, style?: MotionStyle }> = ({ markdown, style }) => {
  return (
      <motion.div
          className="w-full sm:w-1/2 h-1/2 sm:h-full overflow-auto p-4 bg-card text-card-foreground"
          style={style}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
      >
        <div dangerouslySetInnerHTML={{ __html: markdown }} />
      </motion.div>
  );
};

export default MarkdownDualDisplay;
