import { TapTargetButtonGroup } from "@/components/icons/TapTargetButton";
import {
  OpenAITapButton,
  AnthropicTapButton,
  GoogleTapButton,
  GeminiTapButton,
  MetaTapButton,
  XaiTapButton,
  XTweetTapButton,
  CpuTapButton,
  ClaudeTapButton,
  LlamaTapButton,
  DeepSeekTapButton,
  FluxTapButton,
  GrokTapButton,
  MistralTapButton,
  PerplexityTapButton,
  PowerTapButton,
  TextGenerationTapButton,
  ImageGenerationTapButton,
  VideoGenerationTapButton,
  AudioLinesTapButton,
  TranscriptionTapButton,
  TranslationTapButton,
  CodeGenerationTapButton,
} from "@/components/icons/ai-tap-buttons";
import {
  MenuTapButton,
  PlusTapButton,
  SearchTapButton,
  SettingsTapButton,
  Settings2TapButton,
  MaximizeTapButton,
  ArrowDownUpTapButton,
  BellTapButton,
  UploadTapButton,
  UndoTapButton,
  RedoTapButton,
  CopyTapButton,
  TrashTapButton,
  ChevronLeftTapButton,
  PanelLeftTapButton,
  PanelRightTapButton,
  SquarePenTapButton,
  XTapButton,
  FilterTapButton,
  PlayTapButton,
  PauseTapButton,
  StopTapButton,
  Volume2TapButton,
  ArrowUpTapButton,
  MicTapButton,
  MicOffTapButton,
  BugTapButton,
  SaveTapButton,
  SendTapButton,
  MessageTapButton,
  VariableTapButton,
  WrenchTapButton,
  CommandTapButton,
  TerminalTapButton,
  TestTubeTapButton,
  ResetTapButton,
  ClearTapButton,
  RetryTapButton,
  LoadingTapButton,
  RobotTapButton,
  WebhookTapButton,
  ViewTapButton,
  BuildTapButton,
  RunTapButton,
  HistoryTapButton,
} from "@/components/icons/tap-buttons";
import { TapTargetLabeled as Labeled } from "@/components/icons/TapTargetLabeled";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demos/button-demo", {
  title: "Button Demo",
  description: "Interactive demo: Button Demo. AI Matrx demo route.",
});

export default function ButtonDemoPage() {
  return (
    <div className="p-8 space-y-12">
      <div>
        <h1 className="text-3xl font-bold mb-2">AI Tap Buttons Demo</h1>
        <p className="text-muted-foreground">
          A showcase of the modular TapTargetButton system applied to AI
          providers and generic tools. Hover any button to see its name.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">
          Model Provider Selector (Brand Colors)
        </h2>
        <p className="text-sm text-muted-foreground w-1/2">
          Clicking a logo could expand secondary options for that specific
          provider&apos;s sub-models. All black-brand logos safely use
          currentColor.
        </p>
        <div className="flex flex-wrap gap-1">
          <Labeled label="Google">
            <GoogleTapButton colored />
          </Labeled>
          <Labeled label="Gemini">
            <GeminiTapButton colored />
          </Labeled>
          <Labeled label="OpenAI">
            <OpenAITapButton colored />
          </Labeled>
          <Labeled label="Anthropic">
            <AnthropicTapButton colored />
          </Labeled>
          <Labeled label="Claude">
            <ClaudeTapButton colored />
          </Labeled>
          <Labeled label="xAI">
            <XaiTapButton colored />
          </Labeled>
          <Labeled label="Grok">
            <GrokTapButton colored />
          </Labeled>
          <Labeled label="Meta">
            <MetaTapButton colored />
          </Labeled>
          <Labeled label="Llama">
            <LlamaTapButton colored />
          </Labeled>
          <Labeled label="DeepSeek">
            <DeepSeekTapButton colored />
          </Labeled>
          <Labeled label="Mistral">
            <MistralTapButton colored />
          </Labeled>
          <Labeled label="Perplexity">
            <PerplexityTapButton colored />
          </Labeled>
          <Labeled label="Flux">
            <FluxTapButton colored />
          </Labeled>
          <Labeled label="CPU">
            <CpuTapButton />
          </Labeled>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">
          Model Provider Selector (Monochrome)
        </h2>
        <p className="text-sm text-muted-foreground w-1/2">
          The same group automatically styled to adapt to the surrounding text
          color for minimalist interfaces.
        </p>
        <div className="flex flex-wrap gap-1">
          <Labeled label="Google">
            <GoogleTapButton />
          </Labeled>
          <Labeled label="Gemini">
            <GeminiTapButton />
          </Labeled>
          <Labeled label="OpenAI">
            <OpenAITapButton />
          </Labeled>
          <Labeled label="Anthropic">
            <AnthropicTapButton />
          </Labeled>
          <Labeled label="Claude">
            <ClaudeTapButton />
          </Labeled>
          <Labeled label="xAI">
            <XaiTapButton />
          </Labeled>
          <Labeled label="Grok">
            <GrokTapButton />
          </Labeled>
          <Labeled label="Meta">
            <MetaTapButton />
          </Labeled>
          <Labeled label="Llama">
            <LlamaTapButton />
          </Labeled>
          <Labeled label="DeepSeek">
            <DeepSeekTapButton />
          </Labeled>
          <Labeled label="Mistral">
            <MistralTapButton />
          </Labeled>
          <Labeled label="Perplexity">
            <PerplexityTapButton />
          </Labeled>
          <Labeled label="Flux">
            <FluxTapButton />
          </Labeled>
          <Labeled label="CPU">
            <CpuTapButton />
          </Labeled>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">
          AI Action Tools — Lightning Family
        </h2>
        <p className="text-sm text-muted-foreground w-1/2">
          A cohesive set of AI action icons built around the lightning bolt
          motif. Each combines the bolt with domain-specific elements for
          instant recognition.
        </p>
        <div className="flex flex-wrap gap-1">
          <Labeled label="Power">
            <PowerTapButton />
          </Labeled>
          <Labeled label="Text Gen">
            <TextGenerationTapButton />
          </Labeled>
          <Labeled label="Image Gen">
            <ImageGenerationTapButton />
          </Labeled>
          <Labeled label="Video Gen">
            <VideoGenerationTapButton />
          </Labeled>
          <Labeled label="Audio">
            <AudioLinesTapButton />
          </Labeled>
          <Labeled label="Code Gen">
            <CodeGenerationTapButton />
          </Labeled>
          <Labeled label="Transcribe">
            <TranscriptionTapButton />
          </Labeled>
          <Labeled label="Translate">
            <TranslationTapButton />
          </Labeled>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">
          Standalone Submissions (Variant: Solid)
        </h2>
        <p className="text-sm text-muted-foreground w-1/2">
          Utilizing primary solid buttons for high-priority generation triggers
          outside of a group.
        </p>
        <div className="flex flex-wrap gap-1">
          <Labeled label="Power">
            <PowerTapButton variant="solid" bgColor="bg-blue-600" />
          </Labeled>
          <Labeled label="Text Gen">
            <TextGenerationTapButton variant="solid" bgColor="bg-violet-600" />
          </Labeled>
          <Labeled label="Image Gen">
            <ImageGenerationTapButton
              variant="solid"
              bgColor="bg-emerald-600"
            />
          </Labeled>
          <Labeled label="Code Gen">
            <CodeGenerationTapButton variant="solid" bgColor="bg-amber-600" />
          </Labeled>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Webhook Action Group</h2>
        <p className="text-sm text-muted-foreground w-1/2">
          A compact action bar for webhook-centric workflows — trigger, inspect,
          build, run, review history, add a new item, or open the nav menu.
        </p>
        <div className="flex gap-4">
          <TapTargetButtonGroup>
            <WebhookTapButton variant="group" />
            <ViewTapButton variant="group" />
            <BuildTapButton variant="group" />
            <RunTapButton variant="group" />
            <HistoryTapButton variant="group" />
            <PlusTapButton variant="group" />
            <MenuTapButton variant="group" />
          </TapTargetButtonGroup>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">All Icons — Glass (default)</h2>
        <p className="text-sm text-muted-foreground">
          Every general-purpose tap button at default glass variant.
        </p>
        <div className="flex flex-wrap gap-1">
          <Labeled label="Menu">
            <MenuTapButton />
          </Labeled>
          <Labeled label="Add">
            <PlusTapButton />
          </Labeled>
          <Labeled label="Search">
            <SearchTapButton />
          </Labeled>
          <Labeled label="Settings">
            <SettingsTapButton />
          </Labeled>
          <Labeled label="Settings2">
            <Settings2TapButton />
          </Labeled>
          <Labeled label="Maximize">
            <MaximizeTapButton />
          </Labeled>
          <Labeled label="Sort">
            <ArrowDownUpTapButton />
          </Labeled>
          <Labeled label="Bell">
            <BellTapButton />
          </Labeled>
          <Labeled label="Upload">
            <UploadTapButton />
          </Labeled>
          <Labeled label="Undo">
            <UndoTapButton />
          </Labeled>
          <Labeled label="Redo">
            <RedoTapButton />
          </Labeled>
          <Labeled label="Copy">
            <CopyTapButton />
          </Labeled>
          <Labeled label="Delete">
            <TrashTapButton />
          </Labeled>
          <Labeled label="Back">
            <ChevronLeftTapButton />
          </Labeled>
          <Labeled label="PanelLeft">
            <PanelLeftTapButton />
          </Labeled>
          <Labeled label="PanelRight">
            <PanelRightTapButton />
          </Labeled>
          <Labeled label="New Chat">
            <SquarePenTapButton />
          </Labeled>
          <Labeled label="Close">
            <XTapButton />
          </Labeled>
          <Labeled label="Filter">
            <FilterTapButton />
          </Labeled>
          <Labeled label="Play">
            <PlayTapButton />
          </Labeled>
          <Labeled label="Pause">
            <PauseTapButton />
          </Labeled>
          <Labeled label="Stop">
            <StopTapButton />
          </Labeled>
          <Labeled label="Volume">
            <Volume2TapButton />
          </Labeled>
          <Labeled label="ArrowUp">
            <ArrowUpTapButton />
          </Labeled>
          <Labeled label="Mic">
            <MicTapButton />
          </Labeled>
          <Labeled label="MicOff">
            <MicOffTapButton />
          </Labeled>
          <Labeled label="Bug">
            <BugTapButton />
          </Labeled>
          <Labeled label="Save">
            <SaveTapButton />
          </Labeled>
          <Labeled label="Send">
            <SendTapButton />
          </Labeled>
          <Labeled label="Message">
            <MessageTapButton />
          </Labeled>
          <Labeled label="Variable">
            <VariableTapButton />
          </Labeled>
          <Labeled label="Wrench">
            <WrenchTapButton />
          </Labeled>
          <Labeled label="Command">
            <CommandTapButton />
          </Labeled>
          <Labeled label="Terminal">
            <TerminalTapButton />
          </Labeled>
          <Labeled label="TestTube">
            <TestTubeTapButton />
          </Labeled>
          <Labeled label="Reset">
            <ResetTapButton />
          </Labeled>
          <Labeled label="Clear">
            <ClearTapButton />
          </Labeled>
          <Labeled label="Retry">
            <RetryTapButton />
          </Labeled>
          <Labeled label="Loading">
            <LoadingTapButton />
          </Labeled>
          <Labeled label="Robot">
            <RobotTapButton />
          </Labeled>
          <Labeled label="Webhook">
            <WebhookTapButton />
          </Labeled>
          <Labeled label="View">
            <ViewTapButton />
          </Labeled>
          <Labeled label="Build">
            <BuildTapButton />
          </Labeled>
          <Labeled label="Run">
            <RunTapButton />
          </Labeled>
          <Labeled label="History">
            <HistoryTapButton />
          </Labeled>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">All Icons — Transparent</h2>
        <p className="text-sm text-muted-foreground">
          Same set with variant=&quot;transparent&quot; — hover shows a muted
          bg, no glass border.
        </p>
        <div className="flex flex-wrap gap-1">
          <Labeled label="Menu">
            <MenuTapButton variant="transparent" />
          </Labeled>
          <Labeled label="Add">
            <PlusTapButton variant="transparent" />
          </Labeled>
          <Labeled label="Search">
            <SearchTapButton variant="transparent" />
          </Labeled>
          <Labeled label="Settings">
            <SettingsTapButton variant="transparent" />
          </Labeled>
          <Labeled label="Settings2">
            <Settings2TapButton variant="transparent" />
          </Labeled>
          <Labeled label="Maximize">
            <MaximizeTapButton variant="transparent" />
          </Labeled>
          <Labeled label="Sort">
            <ArrowDownUpTapButton variant="transparent" />
          </Labeled>
          <Labeled label="Bell">
            <BellTapButton variant="transparent" />
          </Labeled>
          <Labeled label="Upload">
            <UploadTapButton variant="transparent" />
          </Labeled>
          <Labeled label="Undo">
            <UndoTapButton variant="transparent" />
          </Labeled>
          <Labeled label="Redo">
            <RedoTapButton variant="transparent" />
          </Labeled>
          <Labeled label="Copy">
            <CopyTapButton variant="transparent" />
          </Labeled>
          <Labeled label="Delete">
            <TrashTapButton variant="transparent" />
          </Labeled>
          <Labeled label="Back">
            <ChevronLeftTapButton variant="transparent" />
          </Labeled>
          <Labeled label="PanelLeft">
            <PanelLeftTapButton variant="transparent" />
          </Labeled>
          <Labeled label="PanelRight">
            <PanelRightTapButton variant="transparent" />
          </Labeled>
          <Labeled label="New Chat">
            <SquarePenTapButton variant="transparent" />
          </Labeled>
          <Labeled label="Close">
            <XTapButton variant="transparent" />
          </Labeled>
          <Labeled label="Filter">
            <FilterTapButton variant="transparent" />
          </Labeled>
          <Labeled label="Play">
            <PlayTapButton variant="transparent" />
          </Labeled>
          <Labeled label="Pause">
            <PauseTapButton variant="transparent" />
          </Labeled>
          <Labeled label="Stop">
            <StopTapButton variant="transparent" />
          </Labeled>
          <Labeled label="Volume">
            <Volume2TapButton variant="transparent" />
          </Labeled>
          <Labeled label="ArrowUp">
            <ArrowUpTapButton variant="transparent" />
          </Labeled>
          <Labeled label="Mic">
            <MicTapButton variant="transparent" />
          </Labeled>
          <Labeled label="MicOff">
            <MicOffTapButton variant="transparent" />
          </Labeled>
          <Labeled label="Bug">
            <BugTapButton variant="transparent" />
          </Labeled>
          <Labeled label="Save">
            <SaveTapButton variant="transparent" />
          </Labeled>
          <Labeled label="Send">
            <SendTapButton variant="transparent" />
          </Labeled>
          <Labeled label="Message">
            <MessageTapButton variant="transparent" />
          </Labeled>
          <Labeled label="Variable">
            <VariableTapButton variant="transparent" />
          </Labeled>
          <Labeled label="Wrench">
            <WrenchTapButton variant="transparent" />
          </Labeled>
          <Labeled label="Command">
            <CommandTapButton variant="transparent" />
          </Labeled>
          <Labeled label="Terminal">
            <TerminalTapButton variant="transparent" />
          </Labeled>
          <Labeled label="TestTube">
            <TestTubeTapButton variant="transparent" />
          </Labeled>
          <Labeled label="Reset">
            <ResetTapButton variant="transparent" />
          </Labeled>
          <Labeled label="Clear">
            <ClearTapButton variant="transparent" />
          </Labeled>
          <Labeled label="Retry">
            <RetryTapButton variant="transparent" />
          </Labeled>
          <Labeled label="Loading">
            <LoadingTapButton variant="transparent" />
          </Labeled>
          <Labeled label="Robot">
            <RobotTapButton variant="transparent" />
          </Labeled>
          <Labeled label="Webhook">
            <WebhookTapButton variant="transparent" />
          </Labeled>
          <Labeled label="View">
            <ViewTapButton variant="transparent" />
          </Labeled>
          <Labeled label="Build">
            <BuildTapButton variant="transparent" />
          </Labeled>
          <Labeled label="Run">
            <RunTapButton variant="transparent" />
          </Labeled>
          <Labeled label="History">
            <HistoryTapButton variant="transparent" />
          </Labeled>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">All Icons — Group</h2>
        <p className="text-sm text-muted-foreground">
          Same set inside a TapTargetButtonGroup — smaller, tighter, single pill
          border. Hover individual buttons for names.
        </p>
        <TapTargetButtonGroup>
          <MenuTapButton variant="group" />
          <PlusTapButton variant="group" />
          <SearchTapButton variant="group" />
          <SettingsTapButton variant="group" />
          <Settings2TapButton variant="group" />
          <MaximizeTapButton variant="group" />
          <ArrowDownUpTapButton variant="group" />
          <BellTapButton variant="group" />
          <UploadTapButton variant="group" />
          <UndoTapButton variant="group" />
          <RedoTapButton variant="group" />
          <CopyTapButton variant="group" />
          <TrashTapButton variant="group" />
          <ChevronLeftTapButton variant="group" />
          <PanelLeftTapButton variant="group" />
          <PanelRightTapButton variant="group" />
          <SquarePenTapButton variant="group" />
          <XTapButton variant="group" />
          <FilterTapButton variant="group" />
          <PlayTapButton variant="group" />
          <PauseTapButton variant="group" />
          <StopTapButton variant="group" />
          <Volume2TapButton variant="group" />
          <ArrowUpTapButton variant="group" />
          <MicTapButton variant="group" />
          <MicOffTapButton variant="group" />
          <BugTapButton variant="group" />
          <SaveTapButton variant="group" />
          <SendTapButton variant="group" />
          <MessageTapButton variant="group" />
          <VariableTapButton variant="group" />
          <WrenchTapButton variant="group" />
          <CommandTapButton variant="group" />
          <TerminalTapButton variant="group" />
          <TestTubeTapButton variant="group" />
          <ResetTapButton variant="group" />
          <ClearTapButton variant="group" />
          <RetryTapButton variant="group" />
          <LoadingTapButton variant="group" />
          <RobotTapButton variant="group" />
          <WebhookTapButton variant="group" />
          <ViewTapButton variant="group" />
          <BuildTapButton variant="group" />
          <RunTapButton variant="group" />
          <HistoryTapButton variant="group" />
        </TapTargetButtonGroup>
      </section>
    </div>
  );
}
