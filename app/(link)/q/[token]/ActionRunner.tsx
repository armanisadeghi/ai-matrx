"use client";

// app/(link)/q/[token]/ActionRunner.tsx — WHAT THE PERSON DOES.
//
// ONE component, switching on `render.form`, and nothing in this file derives
// anything from `kind`. The render spec is aidream's — the title, the choices,
// the consequence sentence, the submit label and the footnote all arrive
// written. A second copy of that registry here would one day disagree with the
// first, and on a credential form the disagreement would let somebody in.
//
// MOBILE FIRST BECAUSE THIS IS A PHONE ACT. The link arrives as a text and is
// answered in a queue or a car park: `min-h-dvh` never `h-screen`, the safe-area
// inset at the foot, `matrx-touch-targets` on the page shell, and `text-base` on
// every field — the iOS zoom floor, and also just legible.
//
// THE CONFIRMATION IS SYNCHRONOUS AND UNMISTAKABLE. The completion answers with
// the server's own "Got it, I'm on it." and a sentence saying what happens
// next, and those two are what the screen shows. A spinner that resolves into
// the same form is how a person taps twice.
//
// A REFUSAL LEAVES THE FORM USABLE. A 409 is "the thing you are answering has
// moved, or that answer was not accepted" — the server's message and its remedy
// are printed above the controls, and the controls stay live so the remedy can
// be acted on.

import { useCallback, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@ai-matrx/design-system";
import type {
  ActionRequestReady,
  ActionRequestRefusal,
  ConfirmDetailsRender,
  CredentialRender,
  OneTimeCodeRender,
  PickTimeRender,
} from "@/features/action-requests/service";

/** What the page hands to `/api/q/<token>`. `origin` is the ECHO of the site
 *  this page displayed — aidream compares it to the origin on the row. */
type Answer = {
  result?: Record<string, unknown>;
  field_values?: Record<string, string>;
  authenticator_secret?: string;
  origin?: string;
};

type Done = { message: string; next: string | null };

export function ActionRunner({
  token,
  request,
}: {
  token: string;
  request: ActionRequestReady;
}) {
  const { render } = request;
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<ActionRequestRefusal | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  // A SECOND TAP WHILE IN FLIGHT DOES NOTHING. `busy` alone is a render behind
  // the tap; the ref is checked in the same turn the handler runs.
  const inFlight = useRef(false);

  const submit = useCallback(
    async (answer: Answer) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setBusy(true);
      setRefusal(null);
      try {
        const response = await fetch(`/api/q/${token}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(answer),
        });
        const body = (await response.json().catch(() => null)) as
          | {
              state?: string;
              message?: string | null;
              next?: string | null;
              code?: string;
              remedy?: string | null;
            }
          | null;

        if (response.status === 409 || response.status === 400) {
          setRefusal({
            code: body?.code ?? "refused",
            message: body?.message ?? UNREACHED,
            remedy: body?.remedy ?? null,
          });
          return;
        }
        if (!response.ok || !body) {
          setRefusal({ code: "unreachable", message: UNREACHED, remedy: null });
          return;
        }
        if (body.state === "done") {
          setDone({ message: body.message ?? "Got it.", next: body.next ?? null });
          return;
        }
        // A ONE-TIME CODE THAT EXPIRED ON THE WAY IN IS NOT AN ERROR AND NOT AN
        // ENDING. The same link is still live — the server released its claim
        // rather than burning it — so the page says what happened, in the
        // server's words, and leaves the box empty and ready. Never "that was
        // rejected": their code was right when they read it.
        if (body.state === "retry") {
          setRefusal({
            code: "code_expired",
            message: body.message ?? UNREACHED,
            remedy: body.next ?? null,
          });
          return;
        }
        // `unavailable` and `wrong_person` are answers too, and each carries its
        // own sentence. They end the page: there is nothing left to answer.
        setDone({ message: body.message ?? UNREACHED, next: null });
      } catch {
        setRefusal({ code: "offline", message: UNREACHED, remedy: null });
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    [token],
  );

  if (done) {
    return (
      <section className="flex flex-col justify-center py-10 text-center">
        {/* THE SERVER'S OWN CONFIRMATION — "Got it, I'm on it." */}
        <h1 className="text-xl font-medium">{done.message}</h1>
        {done.next ? (
          <p className="mt-3 text-sm text-muted-foreground">{done.next}</p>
        ) : null}
        <p className="mt-8 text-xs text-muted-foreground">You can close this page.</p>
      </section>
    );
  }

  const problem = refusal ? (
    <div className="flex flex-col gap-1">
      <p className="text-sm text-destructive">{refusal.message}</p>
      {refusal.remedy ? (
        <p className="text-sm text-muted-foreground">{refusal.remedy}</p>
      ) : null}
    </div>
  ) : null;

  const head = (
    <header className="flex flex-col gap-2">
      <h1 className="text-xl font-medium">{render.title}</h1>
      {render.subtitle ? (
        <p className="text-sm text-muted-foreground">{render.subtitle}</p>
      ) : null}
    </header>
  );

  const foot = render.footnote ? (
    <p className="text-xs text-muted-foreground">{render.footnote}</p>
  ) : null;

  const shell = (body: React.ReactNode) => (
    <section className="flex flex-col gap-5 py-10">
      {head}
      {problem}
      {body}
      {foot}
    </section>
  );

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
              onClick={() =>
                void submit({ result: { approved: choice.value === "yes" } })
              }
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
              onClick={() => void submit({ result: { value: choice.value } })}
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
      return shell(
        <ConfirmDetails render={render} busy={busy} onSubmit={submit} />,
      );

    case "pick_time":
      return shell(<PickTime render={render} busy={busy} onSubmit={submit} />);

    case "credential":
      return shell(<Credential render={render} busy={busy} onSubmit={submit} />);

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
              void submit({ result: { taking_over: true }, origin: render.origin })
            }
          >
            {render.submit_label}
          </Button>
        </div>,
      );

    // UPLOADING FROM A LINK HAS NO DOOR YET, AND A FILE PICKER THAT CANNOT SEND
    // ANYTHING IS WORSE THAN NONE. aidream's `upload_file` result is a list of
    // file ids, and every byte store this app can reach needs the uploader's own
    // session — which a link visitor does not have. So the ask is shown in full
    // and the screen says plainly what it cannot do and what to do instead,
    // rather than drawing a control that would fail at the end.
    case "upload_file":
      return shell(
        <p className="rounded-md border border-border bg-card p-3 text-sm">
          Files cannot be sent from this link yet. Reply to the message your
          agent sent you with the file attached, and it will pick it up there.
        </p>,
      );

    case "one_time_code":
      return shell(
        <OneTimeCode render={render} busy={busy} onSubmit={submit} />,
      );
  }
}

/**
 * "Text me a new link." Posts to the re-mint door, which needs no sign-in and
 * does not wake the agent — the parked call is untouched, so nothing on the
 * other end learns a link was re-sent.
 */
export function TextMeANewLink({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const inFlight = useRef(false);

  const send = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const response = await fetch(`/api/q/${token}/remint`, { method: "POST" });
      const body = (await response.json().catch(() => null)) as {
        message?: string | null;
      } | null;
      // EVERY OUTCOME IS A SENTENCE — sent, too soon, too many, already
      // answered, gone. The server writes all of them.
      setSaid(body?.message ?? UNREACHED);
    } catch {
      setSaid(UNREACHED);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, [token]);

  if (said) return <p className="text-sm text-muted-foreground">{said}</p>;

  return (
    <Button className="w-full" disabled={busy} onClick={() => void send()}>
      {busy ? "Sending…" : "Text me a new link"}
    </Button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function ConfirmDetails({
  render,
  busy,
  onSubmit,
}: {
  render: ConfirmDetailsRender;
  busy: boolean;
  onSubmit: (answer: Answer) => void | Promise<void>;
}) {
  const [edits, setEdits] = useState<Record<string, string>>({});

  return (
    <div className="flex flex-col gap-4">
      {render.rows.map((row) =>
        row.editable ? (
          <div key={row.key} className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" htmlFor={`q-${row.key}`}>
              {row.label}
            </label>
            <Input
              id={`q-${row.key}`}
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
          // ONLY WHAT ACTUALLY CHANGED travels as a correction. An unchanged
          // field sent back as a "correction" is a fact the agent did not learn.
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

function PickTime({
  render,
  busy,
  onSubmit,
}: {
  render: PickTimeRender;
  busy: boolean;
  onSubmit: (answer: Answer) => void | Promise<void>;
}) {
  // THE TIME IS SHOWN IN THE TIMEZONE THE AGENT OFFERED IT IN, and the zone is
  // named. A slot printed in the phone's zone with no label is how somebody
  // agrees to a meeting at four in the morning.
  const format = useMemo(() => {
    try {
      return new Intl.DateTimeFormat(undefined, {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
        ...(render.timezone ? { timeZone: render.timezone } : {}),
      });
    } catch {
      return new Intl.DateTimeFormat(undefined, {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      });
    }
  }, [render.timezone]);

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

function Credential({
  render,
  busy,
  onSubmit,
}: {
  render: CredentialRender;
  busy: boolean;
  onSubmit: (answer: Answer) => void | Promise<void>;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [authenticator, setAuthenticator] = useState("");
  // THE FIRST NON-SECRET BOX IS THE USERNAME, so a password manager fills the
  // pair instead of offering to save a password with no account beside it.
  const firstPlain = render.fields.find((field) => !field.secret)?.key;

  return (
    <div className="flex flex-col gap-4">
      {/* WHICH SITE, AND WHERE THE AGENT IS — both server-derived. This line is
          the difference between a credential page and a phishing page, so it is
          never assembled from anything the browser knows. */}
      <p className="rounded-md border border-border bg-card p-3 text-sm">
        {render.origin}
      </p>

      {render.fields.map((field) => (
        <div key={field.key} className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor={`q-${field.key}`}>
            {field.label}
          </label>
          <Input
            id={`q-${field.key}`}
            className="text-base"
            type={field.secret ? "password" : "text"}
            autoComplete={
              field.secret
                ? "current-password"
                : field.key === firstPlain
                  ? "username"
                  : "off"
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

      {/* ONLY WHEN THE SERVER SAID SO. aidream refuses an authenticator secret
          the kind did not allow, so a box here that it did not allow would be a
          box whose contents are thrown away. */}
      {render.allow_authenticator_secret ? (
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="q-authenticator">
            Authenticator setup key (optional)
          </label>
          <Textarea
            id="q-authenticator"
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
            ...(authenticator.trim()
              ? { authenticator_secret: authenticator.trim() }
              : {}),
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
 * THE CODE BOX. The one form on this page whose value is worthless a minute
 * from now, and that shapes every decision in it.
 *
 * - **The site is named, server-derived.** Same rule as the credential form: a
 *   page that cannot name what it is answering for is a phishing page.
 * - **One field, numeric, autofocused, `one-time-code` autocomplete** — so iOS
 *   and Android offer the code from the notification instead of making somebody
 *   switch apps and come back to an expired window.
 * - **The box empties on every send.** The code is spent whether it worked or
 *   not; leaving it there invites a second tap that types nothing.
 * - **No "resend" and no "new link" here.** The link is not what expired — the
 *   code is. The server keeps this same link live and the footnote says to send
 *   the next one.
 */
function OneTimeCode({
  render,
  busy,
  onSubmit,
}: {
  render: OneTimeCodeRender;
  busy: boolean;
  onSubmit: (answer: Answer) => void | Promise<void>;
}) {
  const [code, setCode] = useState("");
  // Digits only, and the length the providers use. Stripping the spaces a
  // person's copy-paste brings along is not tidiness: "483 920" typed into a
  // provider's box is a rejected code and a spent attempt.
  const cleaned = code.replace(/\D/g, "").slice(0, 10);
  const ready = cleaned.length >= 4 && !busy;

  const send = () => {
    if (!ready) return;
    setCode("");
    void onSubmit({ field_values: { code: cleaned }, origin: render.origin });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* SERVER-DERIVED, ALWAYS. This is the site the browser is actually
          sitting on, not a name anything typed. */}
      <p className="rounded-md border border-border bg-card p-3 text-sm">
        {render.origin}
      </p>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="q-one-time-code">
          Verification code
        </label>
        <Input
          id="q-one-time-code"
          className="text-center font-mono text-2xl tracking-[0.3em]"
          // `text` with a numeric mode rather than `type="number"`: a number
          // input drops leading zeros and grows spinners nobody wants on a code.
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
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

function safeFormat(format: Intl.DateTimeFormat, iso: string): string {
  const at = new Date(iso);
  // AN UNPARSEABLE INSTANT IS SHOWN AS ITSELF. A silent "Invalid Date" on a
  // booking button is somebody agreeing to nothing.
  return Number.isNaN(at.getTime()) ? iso : format.format(at);
}

const UNREACHED =
  "That did not reach us. Nothing was recorded, so it is safe to try again.";
