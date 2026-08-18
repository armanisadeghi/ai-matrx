"use client";

// features/education/classes/components/JoinClassView.tsx
//
// /education/classes/join — where a student lands with a class code (typed, or
// via the teacher's ?code= link). Signed-in only ((core) group); an anonymous
// visitor is bounced through auth with THIS page (code included) preserved as
// the destination, so signup lands them right back here. Preview before join:
// edu_class_by_code shows what you're joining; edu_class_join_by_code admits
// open/closed classes directly and sends paid classes to the enrolment page.

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { GraduationCap, Loader2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/toast";
import { getClassByCode, joinClassByCode } from "../service";
import type { ClassCodePreview } from "../types";

export function JoinClassView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlCode = (searchParams.get("code") ?? "").trim();

  const [code, setCode] = useState(urlCode);
  const [preview, setPreview] = useState<ClassCodePreview | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [looking, setLooking] = useState(false);
  const [joining, setJoining] = useState(false);
  const [, startTransition] = useTransition();

  async function lookUp(value: string) {
    const trimmed = value.trim();
    if (trimmed.length < 4) return;
    setLooking(true);
    setNotFound(false);
    setPreview(null);
    try {
      const found = await getClassByCode(trimmed);
      if (found) {
        setPreview(found);
      } else {
        setNotFound(true);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not look up that code.");
    } finally {
      setLooking(false);
    }
  }

  // A ?code= deep link looks itself up immediately.
  useEffect(() => {
    if (urlCode) void lookUp(urlCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once for the deep link
  }, []);

  async function join() {
    if (!preview) return;
    setJoining(true);
    try {
      const result = await joinClassByCode(code.trim());
      const target = `/education/classes/${result.classId ?? preview.classId}`;
      if (result.status === "joined") {
        toast.success(`Welcome to ${preview.name}!`);
      } else if (result.status === "already_member") {
        toast.info("You're already in this class.");
      } else if (result.status === "needs_purchase") {
        toast.info("This class requires enrolment — you can enrol on the class page.");
      }
      startTransition(() => router.push(target));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not join with that code.");
      setJoining(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-4 p-4 pt-10">
      <div className="space-y-1 text-center">
        <GraduationCap className="mx-auto h-8 w-8 text-primary" />
        <h1 className="text-lg font-semibold text-foreground">Join a class</h1>
        <p className="text-sm text-muted-foreground">
          Enter the code your teacher shared with you.
        </p>
      </div>

      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void lookUp(code);
        }}
      >
        <Input
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            setPreview(null);
            setNotFound(false);
          }}
          placeholder="e.g. M4KSCN"
          autoFocus
          maxLength={12}
          className="text-center font-mono text-lg tracking-[0.25em] uppercase"
        />
        <Button type="submit" disabled={code.trim().length < 4 || looking}>
          {looking ? <Loader2 className="h-4 w-4 animate-spin" /> : "Find"}
        </Button>
      </form>

      {notFound && (
        <p className="text-center text-sm text-destructive">
          That code didn&apos;t match a class. Check it with your teacher — codes
          can be rotated or turned off.
        </p>
      )}

      {preview && (
        <Card className="space-y-3 p-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              {preview.name}
            </h2>
            {preview.description && (
              <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                {preview.description}
              </p>
            )}
            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              {preview.memberCount}{" "}
              {preview.memberCount === 1 ? "member" : "members"}
            </p>
          </div>
          <Button className="w-full" disabled={joining} onClick={() => void join()}>
            {joining ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : preview.accessMode === "paid" ? (
              "Continue to enrolment"
            ) : (
              "Join class"
            )}
          </Button>
        </Card>
      )}
    </div>
  );
}
