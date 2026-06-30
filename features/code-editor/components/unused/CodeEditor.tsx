"use client";

import { useState } from "react";
import { useMonaco } from "@monaco-editor/react";
import Editor from "@monaco-editor/react";
import { useMeasure } from "@uidotdev/usehooks";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMonacoTheme } from "../../hooks/useMonacoTheme";

interface CodeEditorProps {
  defaultLanguage?: string;
  defaultValue?: string;
  onChange?: (value: string | undefined) => void;
}

const SUPPORTED_LANGUAGES = [
  { id: "javascript", name: "JavaScript" },
  { id: "typescript", name: "TypeScript" },
  { id: "python", name: "Python" },
  { id: "html", name: "HTML" },
  { id: "css", name: "CSS" },
  { id: "json", name: "JSON" },
  { id: "sql", name: "SQL" },
  { id: "java", name: "Java" },
  { id: "csharp", name: "C#" },
  { id: "ruby", name: "Ruby" },
  { id: "php", name: "PHP" },
];

const THEMES = [
  { id: "vs-dark", name: "Dark" },
  { id: "light", name: "Light" },
];

const CodeEditor = ({
  defaultLanguage = "javascript",
  defaultValue = "// Start coding here...",
  onChange,
}: CodeEditorProps) => {
  const [ref, { width, height }] = useMeasure();
  const monaco = useMonaco();
  const [language, setLanguage] = useState(defaultLanguage);
  const isDark = useMonacoTheme();
  const [output, setOutput] = useState<string>("");

  return (
    <div ref={ref} className="flex flex-col w-full h-full">
      <Card className="flex flex-col w-full h-full bg-neutral-100 dark:bg-neutral-700">
        <div className="flex items-center justify-between p-2 border-b">
          <div className="flex gap-2">
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger className="w-[140px] h-[36px]">
                <SelectValue placeholder="Language" />
              </SelectTrigger>
              <SelectContent>
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <SelectItem key={lang.id} value={lang.id}>
                    {lang.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button variant="default">Run Code</Button>
        </div>

        <div className="flex-grow relative">
          <Editor
            height={`${(height ?? 0) - 100}px`}
            width="100%"
            defaultLanguage={language}
            language={language}
            defaultValue={defaultValue}
            theme={isDark ? "customDark" : "customLight"}
            onChange={onChange}
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              lineNumbers: "on",
              scrollBeyondLastLine: false,
              automaticLayout: true,
            }}
          />
        </div>
      </Card>
    </div>
  );
};

export default CodeEditor;
