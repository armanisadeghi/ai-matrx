"use client";

import { useState, type ReactNode } from "react";
import {
  Input,
  BasicInput,
  EnterInput,
  CopyInput,
  InputWithPrefix,
} from "@/components/ui/input";
import {
  Textarea,
  BasicTextarea,
  CopyTextarea,
  TextareaWithPrefix,
} from "@/components/ui/textarea";
import { ProInput } from "@/components/official/ProInput";
import { ProTextarea } from "@/components/official/ProTextarea";
import { Search } from "lucide-react";

function LabCell({
  name,
  path,
  children,
}: {
  name: string;
  path: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-col gap-2 rounded-lg border border-border bg-card p-3">
      <div className="shrink-0 space-y-0.5">
        <div className="text-sm font-semibold text-foreground">{name}</div>
        <div className="font-mono text-[11px] text-muted-foreground">
          {path}
        </div>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}

export default function InputTextareaLabPage() {
  const [input, setInput] = useState("");
  const [basicInput, setBasicInput] = useState("");
  const [enterInput, setEnterInput] = useState("");
  const [copyInput, setCopyInput] = useState("copy me");
  const [prefixInput, setPrefixInput] = useState("");
  const [proInput, setProInput] = useState("");

  const [textarea, setTextarea] = useState("");
  const [basicTextarea, setBasicTextarea] = useState("");
  const [copyTextarea, setCopyTextarea] = useState("copy me");
  const [prefixTextarea, setPrefixTextarea] = useState("");
  const [proTextarea, setProTextarea] = useState("");

  return (
    <div className="h-[calc(100dvh-var(--header-height))] w-full overflow-y-auto bg-textured">
      <div className="grid h-full min-h-0 w-full grid-cols-1 gap-3 p-3 lg:grid-cols-2">
        <div className="grid min-h-0 auto-rows-min grid-cols-1 gap-3 content-start">
          <LabCell name="Input" path="@/components/ui/input · Input">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Input"
            />
          </LabCell>

          <LabCell name="BasicInput" path="@/components/ui/input · BasicInput">
            <BasicInput
              value={basicInput}
              onChange={(e) => setBasicInput(e.target.value)}
              placeholder="BasicInput"
            />
          </LabCell>

          <LabCell name="EnterInput" path="@/components/ui/input · EnterInput">
            <EnterInput
              value={enterInput}
              onChange={(e) => setEnterInput(e.target.value)}
              placeholder="EnterInput"
            />
          </LabCell>

          <LabCell name="CopyInput" path="@/components/ui/input · CopyInput">
            <CopyInput
              value={copyInput}
              onChange={(e) => setCopyInput(e.target.value)}
              placeholder="CopyInput"
            />
          </LabCell>

          <LabCell
            name="InputWithPrefix"
            path="@/components/ui/input · InputWithPrefix"
          >
            <InputWithPrefix
              prefix={<Search className="size-4" />}
              value={prefixInput}
              onChange={(e) => setPrefixInput(e.target.value)}
              placeholder="InputWithPrefix"
            />
          </LabCell>

          <LabCell name="ProInput" path="@/components/official/ProInput">
            <ProInput
              value={proInput}
              onChange={(e) => setProInput(e.target.value)}
              placeholder="ProInput"
            />
          </LabCell>
        </div>

        <div className="grid min-h-0 auto-rows-min grid-cols-1 gap-3 content-start">
          <LabCell name="Textarea" path="@/components/ui/textarea · Textarea">
            <Textarea
              value={textarea}
              onChange={(e) => setTextarea(e.target.value)}
              placeholder="Textarea"
              rows={3}
            />
          </LabCell>

          <LabCell
            name="BasicTextarea"
            path="@/components/ui/textarea · BasicTextarea"
          >
            <BasicTextarea
              value={basicTextarea}
              onChange={(e) => setBasicTextarea(e.target.value)}
              placeholder="BasicTextarea"
              rows={3}
            />
          </LabCell>

          <LabCell
            name="CopyTextarea"
            path="@/components/ui/textarea · CopyTextarea"
          >
            <CopyTextarea
              value={copyTextarea}
              onChange={(e) => setCopyTextarea(e.target.value)}
              placeholder="CopyTextarea"
              rows={3}
            />
          </LabCell>

          <LabCell
            name="TextareaWithPrefix"
            path="@/components/ui/textarea · TextareaWithPrefix"
          >
            <TextareaWithPrefix
              prefix={<Search className="size-4" />}
              value={prefixTextarea}
              onChange={(e) => setPrefixTextarea(e.target.value)}
              placeholder="TextareaWithPrefix"
              rows={3}
            />
          </LabCell>

          <LabCell name="ProTextarea" path="@/components/official/ProTextarea">
            <ProTextarea
              value={proTextarea}
              onChange={(e) => setProTextarea(e.target.value)}
              placeholder="ProTextarea"
              rows={3}
            />
          </LabCell>
        </div>
      </div>
    </div>
  );
}
