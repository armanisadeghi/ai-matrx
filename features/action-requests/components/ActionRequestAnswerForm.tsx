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
import { Eye, EyeOff } from "lucide-react";

import { Input } from "@ai-matrx/design-system";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { cn } from "@/lib/utils";
import type {
  ActionRequestRefusal,
  ApproveSpendRender,
  CaptureField,
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
export function useActionRequestAnswer(
  transport: ActionRequestTransport,
  /** Called once when the server confirms (`state: "done"`). */
  onDone?: (done: ActionRequestDone) => void,
) {
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
        const confirmed = { message: body.message ?? "Got it.", next: body.next ?? null };
        setDone(confirmed);
        onDone?.(confirmed);
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

  // `title` is the server's, except where a form's own live value is IN it:
  // "Approve up to $X?" must name the amount the person has typed, not the one
  // that was suggested, or the heading lies the moment they edit it.
  const head = (title: string) =>
    !card || render.subtitle ? (
      <header className="flex flex-col gap-2">
        {card ? null : <h1 className="text-xl font-medium">{title}</h1>}
        {render.subtitle ? (
          <p className="text-sm text-muted-foreground">{render.subtitle}</p>
        ) : null}
      </header>
    ) : null;

  const foot = render.footnote ? (
    <p className="text-xs text-muted-foreground">{render.footnote}</p>
  ) : null;

  const shell = (body: React.ReactNode, title: string = render.title) => (
    <section className={cn("flex flex-col", card ? "gap-4 p-4" : "gap-5 py-10")}>
      {head(title)}
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

    case "approve_spend":
      return <ApproveSpend render={render} frame={shell} {...common} />;

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

/**
 * The starting values: what the person already said, on non-secret boxes only.
 * A secret box starts empty whatever arrives — a password is typed, never shown.
 */
function prefilledValues(fields: CaptureField[]): Record<string, string> {
  const initial: Record<string, string> = {};
  for (const field of fields) {
    if (!field.secret && typeof field.prefill === "string" && field.prefill) {
      initial[field.key] = field.prefill;
    }
  }
  return initial;
}

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
  fields: CaptureField[];
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
  const [values, setValues] = useState<Record<string, string>>(() =>
    prefilledValues(render.fields),
  );
  const [authenticator, setAuthenticator] = useState("");
  const [showAuthenticator, setShowAuthenticator] = useState(false);

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
          {/* A SETUP KEY IS A SECRET — it mints every future code — so it is
              masked like a password, with an explicit reveal for checking a
              long paste. */}
          <div className="relative">
            <Input
              id={`${idPrefix}-authenticator`}
              className="pr-10 text-base"
              type={showAuthenticator ? "text" : "password"}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={authenticator}
              onChange={(event) => setAuthenticator(event.target.value)}
              placeholder="The long code shown beside the QR when you set up two-factor."
            />
            <button
              type="button"
              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
              aria-label={showAuthenticator ? "Hide setup key" : "Show setup key"}
              aria-pressed={showAuthenticator}
              onClick={() => setShowAuthenticator((shown) => !shown)}
            >
              {showAuthenticator ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
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
  const [values, setValues] = useState<Record<string, string>>(() =>
    prefilledValues(render.fields),
  );

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

/**
 * APPROVE SPEND — a number, not a yes/no (OPENSEO-TOOLS-SPEC §6.2).
 *
 * The person sees, in this order: the server's consequence sentence (real
 * money, and the cap), what the money buys and its estimate, the
 * organization's remaining limit when one applies, then ONE editable amount
 * prefilled with the suggestion, and Approve / Don't spend.
 *
 * Nothing here decides whether they MAY approve — `money` always needs a
 * signed-in session and the page never draws this form without one
 * (`can_complete` is the server's). Nothing here blocks an amount either:
 * below the estimate or above the limit are both allowed and both SAID, in a
 * line under the box, before the click (validation offers, never blocks). The
 * only refusal is an amount that is not an amount.
 */
function ApproveSpend({
  render,
  busy,
  idPrefix,
  autoFocus,
  onSubmit,
  frame,
}: FormProps<ApproveSpendRender> & {
  frame: (body: React.ReactNode, title?: string) => React.ReactNode;
}) {
  // THE SUGGESTION NEVER STARTS BELOW THE ESTIMATE. The server rounds its
  // suggestion to cents, so a $0.004 estimate would arrive as "$0.00" — an
  // amount that buys nothing. Round the estimate UP to the cent instead.
  const suggested = Math.max(render.amount_usd, centsUp(render.estimate_usd));
  const [text, setText] = useState(() => suggested.toFixed(2));
  const [problem, setProblem] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const amount = parseAmount(text);
  const cap = render.guardrail_cap_usd ?? null;
  const yes = render.choices.find((choice) => choice.value === "yes");
  const no = render.choices.find((choice) => choice.value === "no");

  // What the typed amount means, said BEFORE the click — never a block.
  const advisories: string[] = [];
  if (amount !== null && amount > 0) {
    if (amount < render.estimate_usd) {
      advisories.push(
        `That is below the estimate of ${money(render.estimate_usd)}, so your agent will probably have to ask you again before it can run this.`,
      );
    }
    if (cap !== null && amount > cap) {
      advisories.push(
        `That is above your organization's remaining limit, so the approval will be capped at ${money(cap)}.`,
      );
    }
  }

  const approve = () => {
    if (amount === null || amount <= 0) {
      setProblem(`Enter an amount above $0.00 (up to ${money(MAX_APPROVAL_USD)}), or choose "${no?.label ?? "Don't spend"}".`);
      input.current?.focus();
      return;
    }
    setProblem(null);
    void onSubmit({ result: { approved: true, approved_amount_usd: amount } });
  };

  const title =
    amount !== null && amount > 0 && amount !== render.amount_usd
      ? `Approve up to ${money(amount)}?`
      : render.title;

  return frame(
    <div className="flex flex-col gap-4">
      {/* THE CONSEQUENCE FIRST — the server's own sentence. */}
      {render.consequence_note ? (
        <p className="rounded-md border border-border bg-card p-3 text-sm">
          {render.consequence_note}
        </p>
      ) : null}

      <dl className="flex flex-col gap-3 rounded-md border border-border bg-card p-3 text-sm">
        {render.what_it_buys ? (
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs text-muted-foreground">What it buys</dt>
            <dd>{render.what_it_buys}</dd>
          </div>
        ) : null}
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-xs text-muted-foreground">Estimated cost</dt>
          <dd className="font-medium tabular-nums">{money(render.estimate_usd)}</dd>
        </div>
        {cap !== null ? (
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-xs text-muted-foreground">Your organization&apos;s remaining limit</dt>
            <dd className="font-medium tabular-nums">{money(cap)}</dd>
          </div>
        ) : null}
      </dl>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor={`${idPrefix}-amount`}>
          Amount you approve
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-0 flex w-8 items-center justify-center text-muted-foreground">
            $
          </span>
          <Input
            ref={input}
            id={`${idPrefix}-amount`}
            className="pl-8 text-base tabular-nums"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            autoFocus={autoFocus}
            readOnly={!render.amount_editable}
            aria-invalid={problem ? true : undefined}
            aria-describedby={`${idPrefix}-amount-help`}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setProblem(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !busy) approve();
            }}
          />
        </div>
        <div id={`${idPrefix}-amount-help`} className="flex flex-col gap-1">
          {problem ? <p className="text-sm text-destructive">{problem}</p> : null}
          {advisories.map((line) => (
            <p key={line} className="text-sm text-muted-foreground">
              {line}
            </p>
          ))}
          {!problem && advisories.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Your agent can spend up to this amount on this job, and no more.
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <Button className="w-full" disabled={busy} onClick={approve}>
          {yes?.label ?? "Approve this amount"}
        </Button>
        <Button
          variant="ghost"
          className="w-full"
          disabled={busy}
          onClick={() => void onSubmit({ result: { approved: false } })}
        >
          {no?.label ?? "Don't spend"}
        </Button>
      </div>
    </div>,
    title,
  );
}

/** aidream's own ceiling on one approval (`ApproveSpendResult.approved_amount_usd`). */
const MAX_APPROVAL_USD = 100_000;

/** A typed dollar amount, or null when it is not one. Up to two decimals; "$",
 *  spaces and thousands commas are forgiven. */
function parseAmount(text: string): number | null {
  const cleaned = text.replace(/[\s$,]/g, "");
  if (!/^\d+(\.\d{0,2})?$|^\.\d{1,2}$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && value <= MAX_APPROVAL_USD ? value : null;
}

function centsUp(usd: number): number {
  return Math.ceil(Math.round(usd * 1_000_000) / 10_000) / 100;
}

/** Dollars, to the cent — and, under a dollar, to as many as four places, so a
 *  $0.018 estimate reads as itself and a $0.0035 run never reads as "$0.00". */
function money(usd: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: usd > 0 && usd < 1 ? 4 : 2,
  }).format(usd);
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
