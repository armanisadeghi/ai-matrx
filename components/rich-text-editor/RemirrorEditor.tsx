// File Location: components/rich-text-editor/RemirrorEditor.tsx

"use client";

import React, { useCallback, useState, useRef } from 'react';
import 'remirror/styles/all.css';
import './remirror-editor.css';
import {
  Remirror,
  useRemirror,
  EditorComponent,
  useCommands,
  useHelpers,
  useKeymap
} from '@remirror/react';
import {
  BoldExtension,
  ItalicExtension,
  UnderlineExtension,
  MarkdownExtension,
  CodeBlockExtension,
  HistoryExtension,
  TableExtension,
  HeadingExtension,
  BulletListExtension,
  OrderedListExtension,
  LinkExtension,
  ImageExtension,
  BlockquoteExtension,
  HorizontalRuleExtension
} from 'remirror/extensions';
import { motion } from 'motion/react';
import { 
  Bold, Italic, Underline, Code, Link, Image, List, 
  ListOrdered, Quote, Heading1, Heading2, Heading3, 
  Table, Undo, Redo, MinusSquare, Type, FileCode
} from 'lucide-react';
import { useThemeMode } from '@/styles/themes/useThemeMode';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const extensions = () => [
  new BoldExtension({}),
  new ItalicExtension({}),
  new UnderlineExtension({}),
  new MarkdownExtension({}),
  new CodeBlockExtension({}),
  new HistoryExtension({}),
  new TableExtension({}),
  new HeadingExtension({}),
  new BulletListExtension({}),
  new OrderedListExtension({}),
  new LinkExtension({}),
  new ImageExtension({}),
  new BlockquoteExtension({}),
  new HorizontalRuleExtension({})
];

// Link Dialog Component
const LinkDialog: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onInsert: (url: string, text?: string) => void;
}> = ({ isOpen, onClose, onInsert }) => {
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url) {
      onInsert(url, text);
      setUrl('');
      setText('');
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Insert Link</DialogTitle>
          <DialogDescription>
            Add a hyperlink to your document
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="link-url">URL</Label>
            <Input
              id="link-url"
              placeholder="https://example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="link-text">Link Text (optional)</Label>
            <Input
              id="link-text"
              placeholder="Click here"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!url}>
              Insert Link
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

// Image Dialog Component
const ImageDialog: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onInsert: (src: string, alt?: string) => void;
}> = ({ isOpen, onClose, onInsert }) => {
  const [src, setSrc] = useState('');
  const [alt, setAlt] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (src) {
      onInsert(src, alt);
      setSrc('');
      setAlt('');
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Insert Image</DialogTitle>
          <DialogDescription>
            Add an image to your document
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="image-url">Image URL</Label>
            <Input
              id="image-url"
              placeholder="https://example.com/image.jpg"
              value={src}
              onChange={(e) => setSrc(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="image-alt">Alt Text (optional)</Label>
            <Input
              id="image-alt"
              placeholder="Description of the image"
              value={alt}
              onChange={(e) => setAlt(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!src}>
              Insert Image
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const Menu: React.FC<{ lineSpacing: number; onLineSpacingChange: (spacing: number) => void }> = ({ lineSpacing, onLineSpacingChange }) => {
  const commands = useCommands();
  const [showSpacingMenu, setShowSpacingMenu] = useState(false);
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [showImageDialog, setShowImageDialog] = useState(false);

  const handleInsertLink = (url: string, text?: string) => {
    if (text) {
      // If text is provided, we'll need to insert it first
      // For now, just update the link
      commands.updateLink({ href: url });
    } else {
      commands.updateLink({ href: url });
    }
    commands.focus();
  };

  const handleInsertImage = (src: string, alt?: string) => {
    commands.insertImage({ src, alt });
    commands.focus();
  };

  const handleInsertTable = () => {
    commands.insertTable({ rowsCount: 3, columnsCount: 3 });
    commands.focus();
  };

  const buttonGroups = [
    [
      { icon: Bold, action: commands.toggleBold, label: 'Bold' },
      { icon: Italic, action: commands.toggleItalic, label: 'Italic' },
      { icon: Underline, action: commands.toggleUnderline, label: 'Underline' },
    ],
    [
      { icon: Heading1, action: () => commands.toggleHeading({ level: 1 }), label: 'Heading 1' },
      { icon: Heading2, action: () => commands.toggleHeading({ level: 2 }), label: 'Heading 2' },
      { icon: Heading3, action: () => commands.toggleHeading({ level: 3 }), label: 'Heading 3' },
    ],
    [
      { icon: List, action: commands.toggleBulletList, label: 'Bullet List' },
      { icon: ListOrdered, action: commands.toggleOrderedList, label: 'Numbered List' },
      { icon: Quote, action: commands.toggleBlockquote, label: 'Quote' },
    ],
    [
      { icon: Link, action: () => setShowLinkDialog(true), label: 'Insert Link' },
      { icon: Image, action: () => setShowImageDialog(true), label: 'Insert Image' },
      { icon: Table, action: handleInsertTable, label: 'Insert Table' },
    ],
    [
      { icon: Code, action: commands.toggleCode, label: 'Inline Code' },
      { icon: FileCode, action: commands.toggleCodeBlock, label: 'Code Block' },
      { icon: MinusSquare, action: commands.insertHorizontalRule, label: 'Horizontal Rule' },
    ],
    [
      { icon: Undo, action: commands.undo, label: 'Undo' },
      { icon: Redo, action: commands.redo, label: 'Redo' },
    ],
  ];

  return (
    <>
      <motion.div 
        className="flex items-center gap-2 mb-1 p-1 bg-background rounded-md shadow-sm"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {buttonGroups.map((group, groupIndex) => (
          <React.Fragment key={groupIndex}>
            <div className="flex gap-1">
              {group.map((button, index) => (
                <motion.button
                  key={index}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="p-1 bg-primary text-primary-foreground rounded-sm hover:bg-primary/90 focus:ring-1 focus:ring-primary/50 transition-colors"
                  onClick={() => { button.action(); commands.focus(); }}
                  title={button.label}
                >
                  <button.icon size={14} />
                </motion.button>
              ))}
            </div>
            {groupIndex < buttonGroups.length - 1 && <div className="w-px h-6 bg-border" />}
          </React.Fragment>
        ))}
        
        <div className="w-px h-6 bg-border" />
        
        {/* Line Spacing Control */}
        <div className="relative">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="p-1 bg-primary text-primary-foreground rounded-sm hover:bg-primary/90 focus:ring-1 focus:ring-primary/50 transition-colors flex items-center gap-1"
            onClick={() => setShowSpacingMenu(!showSpacingMenu)}
          >
            <Type size={14} />
            <span className="text-xs">{lineSpacing}x</span>
          </motion.button>
          
          {showSpacingMenu && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute top-full mt-1 bg-background border border-border rounded-md shadow-lg z-10 min-w-[80px]"
            >
              {[1, 1.5, 2].map((spacing) => (
                <button
                  key={spacing}
                  className={`w-full px-3 py-2 text-sm text-left hover:bg-muted transition-colors ${
                    lineSpacing === spacing ? 'bg-muted font-semibold' : ''
                  }`}
                  onClick={() => {
                    onLineSpacingChange(spacing);
                    setShowSpacingMenu(false);
                  }}
                >
                  {spacing}x
                </button>
              ))}
            </motion.div>
          )}
        </div>
      </motion.div>
      
      {/* Dialogs */}
      <LinkDialog 
        isOpen={showLinkDialog} 
        onClose={() => setShowLinkDialog(false)} 
        onInsert={handleInsertLink}
      />
      <ImageDialog 
        isOpen={showImageDialog} 
        onClose={() => setShowImageDialog(false)} 
        onInsert={handleInsertImage}
      />
    </>
  );
};

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
      className="remirror-editor remirror-editor-clickable w-full h-full"
    >
      <EditorComponent />
    </div>
  );
};

const RemirrorEditor: React.FC = () => {
  const [height, setHeight] = useState(300);
  const [lineSpacing, setLineSpacing] = useState(1);
  const mode = useThemeMode();
  const { manager, state } = useRemirror({
    extensions,
    content: '',
    stringHandler: 'markdown',
  });

  const handleResize = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const startY = e.clientY;
    const startHeight = height;

    const doDrag = (e: MouseEvent) => {
      setHeight(Math.max(200, startHeight + e.clientY - startY));
    };

    const stopDrag = () => {
      document.removeEventListener('mousemove', doDrag);
      document.removeEventListener('mouseup', stopDrag);
    };

    document.addEventListener('mousemove', doDrag);
    document.addEventListener('mouseup', stopDrag);
  }, [height]);

  return (
    <div className="w-full bg-background shadow-lg rounded-lg overflow-hidden" data-theme={mode}>
      <Remirror manager={manager} initialContent={state} autoFocus>
        <Menu lineSpacing={lineSpacing} onLineSpacingChange={setLineSpacing} />
        <div 
          className="remirror-editor-wrapper w-full border border-border rounded-md focus-within:ring-1 focus-within:ring-primary/50 transition-shadow overflow-auto bg-background"
          style={{ 
            height: `${height}px`, 
            maxHeight: '80dvh',
            '--editor-line-height': lineSpacing
          } as React.CSSProperties}
          data-theme={mode}
        >
          <EditorContent />
        </div>
        <div 
          className="h-1 bg-muted cursor-ns-resize" 
          onMouseDown={handleResize}
        />
        <SaveShortcut />
      </Remirror>
    </div>
  );
};

const SaveShortcut: React.FC = () => {
  const helpers = useHelpers();

  const handleSaveShortcut = useCallback(() => {
    const markdown = helpers.getMarkdown();
    console.log('Saving markdown:', markdown);
    return true;
  }, [helpers]);

  useKeymap('Mod-s', handleSaveShortcut);

  return (
    <motion.div
      className="mt-1 text-xs text-muted-foreground flex items-center justify-end"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.5 }}
    >
      Ctrl+S (Cmd+S on Mac) to save
    </motion.div>
  );
};

export default RemirrorEditor;