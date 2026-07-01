'use client';

import React from 'react';
import { Prism as SyntaxHighlighterBase } from 'react-syntax-highlighter';
import { vscDarkPlus, vs } from 'react-syntax-highlighter/dist/cjs/styles/prism';
import { useThemeMode } from '@/styles/themes/useThemeMode';
import { mapLanguageForPrism } from '@/features/code-editor/config/languages';

const SyntaxHighlighter = ({
  code,
  language = 'sql',
}: {
  code: string;
  language?: string;
}) => {
  const resolvedTheme = useThemeMode();
  const isDark = resolvedTheme === 'dark';
  const style = isDark ? vscDarkPlus : vs;
  const prismLanguage = mapLanguageForPrism(language);

  return (
    <div className="text-sm [&_pre]:!p-4 [&_pre]:!my-0 [&_pre]:!rounded-lg [&_pre]:!text-inherit">
      <SyntaxHighlighterBase
        language={prismLanguage}
        style={style}
        PreTag="div"
        showLineNumbers={false}
        useInlineStyles
        wrapLongLines
        customStyle={{
          margin: 0,
          padding: 0,
          background: 'transparent',
          fontSize: 'inherit',
        }}
      >
        {code}
      </SyntaxHighlighterBase>
    </div>
  );
};

export default SyntaxHighlighter;
