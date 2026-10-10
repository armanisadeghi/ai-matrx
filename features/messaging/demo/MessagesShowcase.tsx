"use client";

import Link from "next/link";
import { DemoAttachment } from "./DemoAttachment";
import { useState } from "react";
import { useThemeMode } from "@/styles/themes/useThemeMode";
import { useAppDispatch } from "@/lib/redux/hooks";
import { setMode } from "@/styles/themes/themeSlice";
import {
  Avatar,
  MessageBubble,
  TypingDots,
  ConversationSkeleton,
  SparklesIcon,
  useMessagingHost,
} from "@ai-matrx/messaging/react";
import { Search, SquarePen, ChevronLeft } from "lucide-react";
import { useOpenMessagesWindow } from "@/features/overlays/openers/messagesWindow";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { MESSAGE_EXAMPLES } from "./examples";
import "../messages-native.css";
import "./showcase.css";

const categories = [
  "Everything",
  ...new Set(MESSAGE_EXAMPLES.map((example) => example.category)),
];

export default function MessagesShowcase() {
  const openMessages = useOpenMessagesWindow();
  const host = useMessagingHost();
  const [category, setCategory] = useState("Everything");
  const [search, setSearch] = useState("");
  const [header, setHeader] = useState("centered");
  const theme = useThemeMode();
  const dispatch = useAppDispatch();
  const [direction, setDirection] = useState("both");
  const [notice, setNotice] = useState(
    "Preview examples — actions do not change real records.",
  );
  const [sidebar, setSidebar] = useState(false);
  const examples = MESSAGE_EXAMPLES.filter(
    (example) =>
      (category === "Everything" || example.category === category) &&
      `${example.title} ${example.message.content}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  if (host === null)
    return (
      <div className="messages-native p-6 pt-[var(--shell-header-h)]">
        <p className="text-sm">Preparing message examples…</p>
        <ConversationSkeleton />
      </div>
    );
  return (
    <>
      <RouteHeader
        left={
          <span className="px-2 text-sm font-medium">
            Messages · Design review
          </span>
        }
      />
      <div className="messages-showcase h-full min-h-0 pt-[var(--shell-header-h)]">
        <div
          className="messages-native showcase-window"
          data-contact-layout={header}
          data-theme={theme}
        >
          <aside className="showcase-sidebar" data-open={sidebar}>
            <div className="showcase-search">
              <Search size={14} />
              <input
                aria-label="Search examples"
                placeholder="Search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <SquarePen size={17} />
            </div>
            <nav aria-label="Message examples">
              {categories.map((item) => (
                <button
                  type="button"
                  key={item}
                  aria-current={category === item ? "true" : undefined}
                  onClick={() => {
                    setCategory(item);
                    setSidebar(false);
                  }}
                >
                  <Avatar name={item} />
                  <span>
                    <strong>{item}</strong>
                    <small>
                      {item === "Everything"
                        ? `${MESSAGE_EXAMPLES.length} message examples`
                        : `${MESSAGE_EXAMPLES.filter((example) => example.category === item).length} examples`}
                    </small>
                  </span>
                </button>
              ))}
            </nav>
            <div className="showcase-settings">
              <label>
                Appearance
                <select
                  aria-label="Preview appearance"
                  value={theme}
                  onChange={(event) =>
                    dispatch(
                      setMode(event.target.value === "dark" ? "dark" : "light"),
                    )
                  }
                >
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </label>
              <label>
                Contact header
                <select
                  aria-label="Contact header"
                  value={header}
                  onChange={(event) => setHeader(event.target.value)}
                >
                  <option value="compact">A · Compact</option>
                  <option value="centered">B · Centered</option>
                </select>
              </label>
              <label>
                Message direction
                <select
                  aria-label="Message direction"
                  value={direction}
                  onChange={(event) => setDirection(event.target.value)}
                >
                  <option value="both">Incoming and outgoing</option>
                  <option value="incoming">Incoming</option>
                  <option value="outgoing">Outgoing</option>
                </select>
              </label>
              <Link href="/messages">Open real conversations</Link>
              <button
                type="button"
                className="text-left text-primary"
                onClick={() => openMessages()}
              >
                Open Messages window
              </button>
            </div>
          </aside>
          <main className="showcase-thread">
            <header className="mx-msg__header">
              <button
                className="showcase-back"
                aria-label="Show example categories"
                onClick={() => setSidebar(!sidebar)}
              >
                <ChevronLeft size={18} />
              </button>
              <Avatar name="Maya Chen" small />
              <span className="mx-msg__header-title">Maya Chen</span>
              <span className="showcase-preview-label">Message showcase</span>
            </header>
            <div className="mx-msg__ai-bar">
              {[
                "Catch me up",
                "Summarize",
                "Action items",
                "Draft a reply",
              ].map((label) => (
                <button
                  type="button"
                  className="mx-msg__chip"
                  key={label}
                  onClick={() =>
                    setNotice(
                      `${label} preview — use a real conversation to run this action.`,
                    )
                  }
                >
                  <SparklesIcon />
                  {label}
                </button>
              ))}
            </div>
            <div className="showcase-transcript" key={`${category}:${search}`}>
              {examples.length === 0 && (
                <div className="mx-msg__empty">
                  {/* read-gate-exempt: showcase filters its bundled examples; nothing is read */}
                  <h3>No matching examples</h3>
                  <p>Try another search.</p>
                </div>
              )}
              {examples.map((example) => (
                <section className="showcase-example" key={example.title}>
                  <h2>{example.title}</h2>
                  {example.note && (
                    <p className="showcase-gap">{example.note}</p>
                  )}
                  <div
                    className="showcase-example-bubbles"
                    onClickCapture={(event) => {
                      const target = event.target;
                      if (
                        target instanceof Element &&
                        target.closest("button,a")
                      ) {
                        event.preventDefault();
                        event.stopPropagation();
                        setNotice(
                          `${example.title}: ${target.closest("button,a")?.textContent || "action"} — preview only.`,
                        );
                      }
                    }}
                  >
                    {(direction === "both"
                      ? [false, true]
                      : [direction === "outgoing"]
                    ).map((isMine) => (
                      <div
                        key={String(isMine)}
                        className={`mx-msg__group${isMine ? " mx-msg__group--mine" : ""}`}
                      >
                        <div className="mx-msg__group-body">
                          <MessageBubble
                            renderAttachment={DemoAttachment}
                            replyTo={
                              example.message.replyToId
                                ? {
                                    ...example.message,
                                    content: "Which version should we use?",
                                    replyToId: null,
                                  }
                                : undefined
                            }
                            message={{
                              ...example.message,
                              senderId: isMine
                                ? host.identity.userId
                                : example.message.senderId,
                            }}
                            isMine={isMine}
                            isLast
                            onReply={() =>
                              setNotice(
                                `Replying to ${example.title} — preview only.`,
                              )
                            }
                            onRetry={() =>
                              setNotice("Retry preview — no message was sent.")
                            }
                            failedEntryId={
                              example.message.deliveryState === "failed"
                                ? "preview"
                                : null
                            }
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
              {(category === "Everything" || category === "States") &&
              (!search || "typing loading".includes(search.toLowerCase())) ? (
                <section className="showcase-example">
                  <h2>Typing and loading</h2>
                  <div className="mx-msg__typing">
                    <TypingDots /> Maya is typing
                  </div>
                  <ConversationSkeleton />
                </section>
              ) : null}
            </div>
            <p role="status" className="showcase-notice">
              {notice}
            </p>
          </main>
        </div>
      </div>
    </>
  );
}
