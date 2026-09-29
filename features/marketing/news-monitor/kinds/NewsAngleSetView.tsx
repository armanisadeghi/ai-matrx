"use client";

/**
 * `news_angle_set` / `news_angle` (NEWS-ENGINE-SPEC §6.13) — the angles job's
 * proposals for one story: each angle's headline, type, decay, the journalist
 * it is for, what proof it needs, and the ideas it refused. The ONE renderer.
 */

import { humanize, isRecord, records, str, strings } from "../run-document";
import { KindCard, Pill } from "./shared";

export function NewsAngleView({ angle, index }: { angle: Record<string, unknown>; index?: number }) {
  const shape = isRecord(angle.journalist_shape) ? angle.journalist_shape : {};
  return (
    <li className="flex flex-col gap-0.5">
      <div className="flex flex-wrap items-center gap-x-2">
        {index != null ? (
          <span className="text-[11px] text-muted-foreground">a{index + 1}</span>
        ) : null}
        <span className="text-sm font-medium text-foreground">{str(angle.headline)}</span>
        {str(angle.story_type) ? <Pill tone="info">{humanize(str(angle.story_type))}</Pill> : null}
        {str(angle.angle_decay) ? (
          <Pill title={str(angle.angle_decay_reason)}>window {str(angle.angle_decay)}</Pill>
        ) : null}
        {angle.tentative === true ? <Pill tone="warn">tentative</Pill> : null}
      </div>
      {str(angle.why_now) ? <p className="text-xs text-foreground">Why now: {str(angle.why_now)}</p> : null}
      {str(shape.sub_beat) || str(shape.outlet_type) ? (
        <p className="text-xs text-muted-foreground">
          For: {[str(shape.sub_beat), str(shape.outlet_type)].filter(Boolean).join(" · ")}
          {str(shape.why_now_for_beat) ? ` — ${str(shape.why_now_for_beat)}` : ""}
          {str(shape.do_not_target) ? ` Not for: ${str(shape.do_not_target)}.` : ""}
        </p>
      ) : null}
      {strings(angle.proof_needed).length ? (
        <p className="text-xs italic text-muted-foreground">
          Needs: {strings(angle.proof_needed).join("; ")}
        </p>
      ) : null}
    </li>
  );
}

export function NewsAngleSetView({
  value,
  title,
}: {
  value: Record<string, unknown>;
  /** The story's headline, when the host knows it (the set carries only its id). */
  title?: string;
}) {
  const angles = records(value.angles);
  const refused = records(value.refused);
  const questions = strings(value.uncomfortable_questions);
  return (
    <KindCard
      testId="news-angle-set"
      title={title ? `Angles — ${title}` : "Angles"}
      subtitle={`${angles.length} angle${angles.length === 1 ? "" : "s"}${refused.length ? ` · ${refused.length} refused` : ""}`}
    >
      {angles.length ? (
        <ul className="flex flex-col gap-2">
          {angles.map((a, i) => (
            <NewsAngleView key={`${str(a.headline)}-${i}`} angle={a} index={i} />
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          No angle survived — awareness only.
        </p>
      )}
      {refused.length ? (
        <div>
          <p className="text-xs font-medium text-foreground">Refused</p>
          <ul className="ml-4 list-disc text-xs text-muted-foreground">
            {refused.map((r, i) => (
              <li key={i}>
                {str(r.idea)} — {humanize(str(r.reason))}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {questions.length ? (
        <div>
          <p className="text-xs font-medium text-foreground">Questions a reporter will ask</p>
          <ul className="ml-4 list-disc text-xs text-muted-foreground">
            {questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {str(value.next_step) ? (
        <p className="text-xs text-foreground">Next step: {str(value.next_step)}</p>
      ) : null}
    </KindCard>
  );
}
