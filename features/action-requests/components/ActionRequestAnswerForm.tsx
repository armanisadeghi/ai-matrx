"use client";

// features/action-requests/components/ActionRequestAnswerForm.tsx — THE ONE ASK FORM.
//
// An agent that needs a person — a yes, a choice, a password, a code — asks
// through ONE primitive (`ask_person`), and the person answers on whichever
// surface they are on: the `/q/<token>` page a text message links to, or the
// card inline in the chat they are already in. Both draw THIS component, so the
// two surfaces can never disagree about what a credential form asks for.
//
// It switches on `render.form` and derives nothing from `kind`. The render spec
// is aidream's — title, choices, consequence sentence, submit label, footnote
// all arrive written. A second copy of that registry here would one day disagree
// with the first, and on a credential form the disagreement would let somebody in.
//
// THE TRANSPORT IS THE CALLER'S, THE OUTCOME IS OURS. The link page posts to
// `/api/q/<token>` (a bearer capability); the chat card posts to aidream's
// authenticated `/action-requests/{id}/complete` (the person's own session).
// `useActionRequestAnswer` reads either door's answer the same way: `done` is
// the server's own confirmation, `retry` is an expired code with the box
// emptied, a 400/409 is a refusal printed above LIVE controls.
//
// SECRETS STAY IN COMPONENT STATE. Typed values live in React state until the
// one POST that carries them, and are never logged, cached or persisted here.

import { useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@ai-matrx/design-system";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { cn } from "@/lib/utils";
import type {
  ActionRequestRefusal,
  ActionRequestRender,
  ConfirmDetailsRender,
  CredentialRender,
  OneTimeCodeRender,
  PickTimeRender,
  VaultItemRender,
} from "@/features/action-requests/service";

/** The answer body — the same shape on both doors. `origin` is the ECHO of the
 *  site this form displayed; aidream compares it to the origin on the row. */
export type ActionRequestAnswer = {
  result?: Record<string, unknown>;
  field_values?: Record<string, string>;
  authenticator_secret?: string;
  origin?: string;
};

/** What a door answered: its HTTP status and its JSON body (or null). */
export type ActionRequestTransportResult = {
  status: number;
  body: {
    state?: string;
    message?: string | null;
    next?: string | null;
    code?: string;
    remedy?: string | null;
  } | null;
};

/** Posts one answer. Throws only when the request never reached anybody. */
export type ActionRequestTransport = (
  answer: ActionRequestAnswer,
) => Promise<ActionRequestTransportResult>;

export type ActionRequestDone = { message: string; next: string | null };

export const ACTION_REQUEST_UNREACHED =
  "That did not reach us. Nothing was recorded, so it is safe to try again.";

/**
 * The submit state machine, shared by every surface that answers an ask.
 * A second tap while in flight does nothing — `busy` is a render behind the
 * tap, so the ref is checked in the same turn the handler runs.
 */
export function useActionRequestAnswer(transport: ActionRequestTransport) {
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<ActionRequestRefusal | null>(null);
  const [done, setDone] = useState<ActionRequestDone | null>(null);
  const inFlight = useRef(false);

  const submit = async (answer: ActionRequestAnswer) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setRefusal(null);
    try {
      const { status, body } = await transport(answer);
      if (status === 409 || status === 400) {
        setRefusal({
          code: body?.code ?? "refused",
          message: body?.message ?? ACTION_REQUEST_UNREACHED,
          remedy: body?.remedy ?? null,
        });
        return;
      }
      if (status < 200 || status >= 300 || !body) {
        setRefusal({ code: "unreachable", message: ACTION_REQUEST_UNREACHED, remedy: null });
        return;
      }
      if (body.state === "done") {
        setDone({ message: body.message ?? "Got it.", next: body.next ?? null });
        return;
      }
      // A ONE-TIME CODE THAT EXPIRED ON THE WAY IN IS NOT AN ERROR AND NOT AN
      // ENDING. The server released its claim rather than burning it, so the
      // form says what happened in the server's words and leaves the box empty
      // and ready. Never "that was rejected": their code was right when read.
      if (body.state === "retry") {
        setRefusal({
          code: "code_expired",
          message: body.message ?? ACTION_REQUEST_UNREACHED,
          remedy: body.next ?? null,
        });
        return;
      }
      // `unavailable` and `wrong_person` are answers too, each with its own
      // sentence. They end the ask: there is nothing left to answer.
      setDone({ message: body.message ?? ACTION_REQUEST_UNREACHED, next: null });
    } catch {
      setRefusal({ code: "offline", message: ACTION_REQUEST_UNREACHED, remedy: null });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return { busy, refusal, done, submit };
}

/**
 * The form for one ask. `layout="page"` is the phone page (title as the page
 * heading, generous spacing); `layout="card"` sits inside a chat tool card whose
 * header already carries the title, so the title is not repeated.
 */
export function ActionRequestAnswerForm({
  render,
  busy,
  refusal,
  onSubmit,
  layout = "page",
}: {
  render: ActionRequestRender;
  busy: boolean;
  refusal: ActionRequestRefusal | null;
  onSubmit: (answer: ActionRequestAnswer) => void | Promise<void>;
  layout?: "page" | "card";
}) {
  const card = layout === "card";
  // Two cards in one chat never share an input id; `useId` is SSR-stable.
  const idPrefix = `q${useId().replace(/:/g, "")}`;

  const problem = refusal ? (
    <div className="flex flex-col gap-1">
      <p className="text-sm text-destructive">
        {refusal.message} <ErrorAlchemyMenu error={refusal.message} />
      </p>
      {refusal.remedy ? (
        <p className="text-sm text-muted-foreground">
          {refusal.remedy} <ErrorAlchemyMenu error={refusal.remedy} />
        </p>
      ) : null}
    </div>
  ) : null;

  const head =
    !card || render.subtitle ? (
      <header className="flex flex-col gap-2">
        {card ? null : <h1 className="text-xl font-medium">{render.title}</h1>}
        {render.subtitle ? (
          <p className="text-sm text-muted-foreground">{render.subtitle}</p>
        ) : null}
      </header>
    ) : null;

  const foot = render.footnote ? (
    <p className="text-xs text-muted-foreground">{render.footnote}</p>
  ) : null;

  const shell = (body: React.ReactNode) => (
    <section className={cn("flex flex-col", card ? "gap-4 p-4" : "gap-5 py-10")}>
      {head}
      {problem}
      {body}
      {foot}
    </section>
  );

  const common = { busy, onSubmit, idPrefix, autoFocus: !card };

  switch (render.form) {
    case "approve":
      return shell(
        <div className="flex flex-col gap-3">
          {/* A DESTRUCTIVE OR EXPENSIVE CLICK STATES ITS CONSEQUENCE FIRST, and
              it is the server's specific sentence, not "are you sure?". */}
          {render.consequence_note ? (
            <p className="rounded-md border border-border bg-card p-3 text-sm">
              {render.consequence_note}
            </p>
          ) : null}
          {render.choices.map((choice) => (
            <Button
              key={choice.value}
              variant={choice.tone === "primary" ? "default" : "ghost"}
              className="w-full"
              disabled={busy}
              onClick={() => void onSubmit({ result: { approved: choice.value === "yes" } })}
            >
              {choice.label}
            </Button>
          ))}
        </div>,
      );

    case "choose_one":
      return shell(
        <div className="flex flex-col gap-3">
          {render.choices.map((choice) => (
            <Button
              key={choice.value}
              variant="outline"
              className="h-auto w-full flex-col items-start gap-1 whitespace-normal py-3 text-left"
              disabled={busy}
              onClick={() => void onSubmit({ result: { value: choice.value } })}
            >
              <span className="font-medium">{choice.label}</span>
              {choice.detail ? (
                <span className="text-xs font-normal text-muted-foreground">
                  {choice.detail}
                </span>
              ) : null}
            </Button>
          ))}
        </div>,
      );

    case "confirm_details":
      return shell(<ConfirmDetails render={render} {...common} />);

    case "pick_time":
      return shell(<PickTime render={render} {...common} />);

    case "credential":
      return shell(<Credential render={render} {...common} />);

    case "vault_item":
      return shell(<VaultItem render={render} {...common} />);

    case "browser_takeover":
      return shell(
        <div className="flex flex-col gap-3">
          {render.detail ? (
            <p className="rounded-md border border-border bg-card p-3 text-sm">
              {render.detail}
            </p>
          ) : null}
          <Button
            className="w-full"
            disabled={busy}
            onClick={() =>
              void onSubmit({ result: { taking_over: true }, origin: render.origin })
            }
          >
            {render.submit_label}
          </Button>
        </div>,
      );

    // NO FILE DOOR YET, AND A PICKER THAT CANNOT SEND ANYTHING IS WORSE THAN
    // NONE. aidream's `upload_file` result is a list of file ids and nothing on
    // either surface mints them for this ask yet, so the ask is shown in full
    // and the screen says plainly what to do instead.
    case "upload_file":
      return shell(
        <p className="rounded-md border border-border bg-card p-3 text-sm">
          Files cannot be sent from here yet. Reply to the message your agent
          sent you with the file attached, and it will pick it up there.
        </p>,
      );

    case "one_time_code":
      return shell(<OneTimeCode render={render} {...common} />);
  }
}

// ─────────────────────────────────────────────────────────────────────────────

type FormProps<R> = {
  render: R;
  busy: boolean;
  idPrefix: string;
  /** Page only: a chat card never steals focus from the composer. */
  autoFocus: boolean;
  onSubmit: (answer: ActionRequestAnswer) => void | Promise<void>;
};

function ConfirmDetails({ render, busy, idPrefix, onSubmit }: FormProps<ConfirmDetailsRender>) {
  const [edits, setEdits] = useState<Record<string, string>>({});

  return (
    <div className="flex flex-col gap-4">
      {render.rows.map((row) =>
        row.editable ? (
          <div key={row.key} className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" htmlFor={`${idPrefix}-${row.key}`}>
              {row.label}
            </label>
            <Input
              id={`${idPrefix}-${row.key}`}
              className="text-base"
              value={edits[row.key] ?? row.value}
              onChange={(event) =>
                setEdits((current) => ({ ...current, [row.key]: event.target.value }))
              }
            />
          </div>
        ) : (
          <div key={row.key} className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">{row.label}</span>
            <span className="text-sm">{row.value}</span>
          </div>
        ),
      )}
      <Button
        className="w-full"
        disabled={busy}
        onClick={() => {
          // ONLY WHAT ACTUALLY CHANGED travels as a correction.
          const corrections: Record<string, string> = {};
          for (const row of render.rows) {
            const edited = edits[row.key];
            if (edited !== undefined && edited !== row.value) corrections[row.key] = edited;
          }
          void onSubmit({ result: { confirmed: true, corrections } });
        }}
      >
        {render.submit_label}
      </Button>
    </div>
  );
}

function PickTime({ render, busy, onSubmit }: FormProps<PickTimeRender>) {
  // THE TIME IS SHOWN IN THE TIMEZONE THE AGENT OFFERED IT IN, and the zone is
  // named. A slot in the device's zone with no label is a 4 a.m. meeting.
  const format = timeFormat(render.timezone);

  return (
    <div className="flex flex-col gap-3">
      {render.options.map((option) => (
        <Button
          key={option}
          variant="outline"
          className="h-auto w-full justify-start whitespace-normal py-3 text-left"
          disabled={busy}
          onClick={() =>
            void onSubmit({
              result: {
                chosen_at: option,
                ...(render.timezone ? { timezone: render.timezone } : {}),
              },
            })
          }
        >
          {safeFormat(format, option)}
        </Button>
      ))}
      <p className="text-xs text-muted-foreground">
        {render.timezone ? `Times are ${render.timezone}.` : "Times are in your device's timezone."}
        {render.duration_minutes ? ` ${render.duration_minutes} minutes.` : ""}
      </p>
    </div>
  );
}

/**
 * The typed field list shared by `credential` and `vault_item`. The first
 * non-secret box is the username, so a password manager fills the pair instead
 * of offering to save a password with no account beside it.
 */
function FieldList({
  fields,
  values,
  setValues,
  idPrefix,
}: {
  fields: { key: string; label: string; secret: boolean }[];
  values: Record<string, string>;
  setValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  idPrefix: string;
}) {
  const firstPlain = fields.find((field) => !field.secret)?.key;
  return (
    <>
      {fields.map((field) => (
        <div key={field.key} className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor={`${idPrefix}-${field.key}`}>
            {field.label}
          </label>
          <Input
            id={`${idPrefix}-${field.key}`}
            className="text-base"
            type={field.secret ? "password" : "text"}
            autoComplete={
              field.secret ? "current-password" : field.key === firstPlain ? "username" : "off"
            }
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={values[field.key] ?? ""}
            onChange={(event) =>
              setValues((current) => ({ ...current, [field.key]: event.target.value }))
            }
          />
        </div>
      ))}
    </>
  );
}

function Credential({ render, busy, idPrefix, onSubmit }: FormProps<CredentialRender>) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [authenticator, setAuthenticator] = useState("");

  return (
    <div className="flex flex-col gap-4">
      {/* WHICH SITE — server-derived. This line is the difference between a
          credential form and a phishing page, so it is never assembled from
          anything the browser knows. */}
      <p className="rounded-md border border-border bg-card p-3 text-sm">{render.origin}</p>

      <FieldList
        fields={render.fields}
        values={values}
        setValues={setValues}
        idPrefix={idPrefix}
      />

      {/* ONLY WHEN THE SERVER SAID SO. aidream refuses an authenticator secret
          the kind did not allow; when it allows one, it stores it. */}
      {render.allow_authenticator_secret ? (
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor={`${idPrefix}-authenticator`}>
            Authenticator setup key (optional)
          </label>
          <Textarea
            id={`${idPrefix}-authenticator`}
            rows={2}
            className="text-base"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={authenticator}
            onChange={(event) => setAuthenticator(event.target.value)}
            placeholder="The long code shown beside the QR when you set up two-factor."
          />
        </div>
      ) : null}

      <Button
        className="w-full"
        disabled={busy}
        onClick={() =>
          void onSubmit({
            field_values: Object.fromEntries(
              render.fields.map((field) => [field.key, values[field.key] ?? ""]),
            ),
            ...(authenticator.trim() ? { authenticator_secret: authenticator.trim() } : {}),
            // THE ECHO. aidream compares this to the origin stored on the row and
            // saves nothing if they differ — scheme, host and port, exactly.
            origin: render.origin,
          })
        }
      >
        {render.submit_label}
      </Button>
    </div>
  );
}

/**
 * "Save this in your vault" — the credential form's field list without the
 * origin line and without the origin echo: nothing is being signed into.
 */
function VaultItem({ render, busy, idPrefix, onSubmit }: FormProps<VaultItemRender>) {
  const [values, setValues] = useState<Record<string, string>>({});

  return (
    <div className="flex flex-col gap-4">
      {render.note ? (
        <p className="rounded-md border border-border bg-card p-3 text-sm">{render.note}</p>
      ) : null}

      <FieldList
        fields={render.fields}
        values={values}
        setValues={setValues}
        idPrefix={idPrefix}
      />

      <Button
        className="w-full"
        disabled={busy}
        onClick={() =>
          void onSubmit({
            field_values: Object.fromEntries(
              render.fields.map((field) => [field.key, values[field.key] ?? ""]),
            ),
          })
        }
      >
        {render.submit_label}
      </Button>
    </div>
  );
}

/**
 * THE CODE BOX — the one form whose value is worthless a minute from now.
 * The site is named (server-derived); one numeric field with `one-time-code`
 * autocomplete; the box empties on every send because the code is spent
 * whether it worked or not.
 */
function OneTimeCode({ render, busy, idPrefix, autoFocus, onSubmit }: FormProps<OneTimeCodeRender>) {
  const [code, setCode] = useState("");
  // Digits only — "483 920" pasted into a provider's box is a spent attempt.
  const cleaned = code.replace(/\D/g, "").slice(0, 10);
  const ready = cleaned.length >= 4 && !busy;

  const send = () => {
    if (!ready) return;
    setCode("");
    void onSubmit({ field_values: { code: cleaned }, origin: render.origin });
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-md border border-border bg-card p-3 text-sm">{render.origin}</p>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor={`${idPrefix}-one-time-code`}>
          Verification code
        </label>
        <Input
          id={`${idPrefix}-one-time-code`}
          className="text-center font-mono text-2xl tracking-[0.3em]"
          // `text` with a numeric mode: a number input drops leading zeros.
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus={autoFocus}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={12}
          placeholder="000000"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") send();
          }}
        />
      </div>

      <Button className="w-full" disabled={!ready} onClick={send}>
        {render.submit_label}
      </Button>
    </div>
  );
}

function timeFormat(timezone: string | null | undefined): Intl.DateTimeFormat {
  const base: Intl.DateTimeFormatOptions = {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  };
  try {
    return new Intl.DateTimeFormat(undefined, {
      ...base,
      ...(timezone ? { timeZone: timezone } : {}),
    });
  } catch {
    return new Intl.DateTimeFormat(undefined, base);
  }
}

function safeFormat(format: Intl.DateTimeFormat, iso: string): string {
  const at = new Date(iso);
  // AN UNPARSEABLE INSTANT IS SHOWN AS ITSELF — never a silent "Invalid Date".
  return Number.isNaN(at.getTime()) ? iso : format.format(at);
}
