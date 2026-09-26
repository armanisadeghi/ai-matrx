"use client";

import { useEffect, useState } from "react";
import { fetchWithOrganization } from "@/lib/organizations/fetchWithOrganization";

type EnrollmentStep = "phone" | "code" | "complete";

type SmsPreferences = {
  phone_number?: string | null;
  sms_enabled?: boolean;
  sms_consent_status?: string | null;
  personal_staff_consent_status?: string | null;
};

/**
 * The SMS programs a person can opt in to. Each has its OWN unchecked consent
 * box and its own consent row — carriers reject bundled consent (see
 * features/sms/compliance.ts).
 */
export type SmsProgram = "notifications" | "personalStaff";
export type SmsProgramFlags = Record<SmsProgram, boolean>;
const NO_PROGRAMS: SmsProgramFlags = { notifications: false, personalStaff: false };

type SmsApiResponse = {
  success?: boolean;
  msg?: string;
  error?: string;
  data?: SmsPreferences & {
    status?: string;
    phoneNumber?: string;
  };
};

export type SmsEnrollmentResult = {
  success: boolean;
  message: string;
};

/**
 * Offer this browser's timezone to `communication.record_person_timezone`.
 * Best-effort and silent: the server decides whether anything is written, and
 * a failure must never surface on a successful enrolment. Never rejects.
 */
async function recordBrowserTimezone(): Promise<void> {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!timezone) return;
    await fetchWithOrganization("/api/person/timezone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timezone, source: "sms_enrollment" }),
    });
  } catch {
    /* best-effort */
  }
}

/**
 * Owns the canonical SMS enrollment flow: explicit consent, Verify OTP,
 * enrollment status hydration, and web-form opt-out.
 */
export function useSmsEnrollment(source: "settings" | "sms-demo") {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [consents, setConsents] = useState<SmsProgramFlags>(NO_PROGRAMS);
  const [enrolled, setEnrolled] = useState<SmsProgramFlags>(NO_PROGRAMS);
  const [personalStaffLegacy, setPersonalStaffLegacy] = useState(false);
  const [step, setStep] = useState<EnrollmentStep>("phone");
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<SmsEnrollmentResult | null>(null);

  useEffect(() => {
    let active = true;

    const loadEnrollment = async () => {
      try {
        const response = await fetchWithOrganization("/api/sms/preferences");
        const payload = (await response.json()) as SmsApiResponse;
        if (!active) return;

        const preferences = payload.data;
        const notificationsOn = preferences?.sms_consent_status === "opted_in";
        const personalStaffStatus = preferences?.personal_staff_consent_status ?? null;
        // A number enrolled before the programs were separated has no Personal
        // Staff row; the send gate honours its earlier consent, so the screen
        // says so rather than showing "Off" for texts that still arrive.
        const legacy = personalStaffStatus === null && notificationsOn;
        const current: SmsProgramFlags = {
          notifications: notificationsOn,
          personalStaff: personalStaffStatus === "opted_in" || legacy,
        };
        setPersonalStaffLegacy(legacy);
        if (
          response.ok &&
          preferences?.sms_enabled &&
          (current.notifications || current.personalStaff) &&
          preferences.phone_number
        ) {
          setPhoneNumber(preferences.phone_number);
          setEnrolled(current);
          setStep("complete");
        } else if (!response.ok && response.status !== 401) {
          setResult({
            success: false,
            message: payload.msg || payload.error || "Unable to load SMS enrollment.",
          });
        }
      } catch (error) {
        if (!active) return;
        setResult({
          success: false,
          message: error instanceof Error ? error.message : "Unable to load SMS enrollment.",
        });
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadEnrollment();
    return () => {
      active = false;
    };
  }, []);

  const requestVerification = async (action: "start" | "verify") => {
    const response = await fetchWithOrganization("/api/sms/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        phoneNumber,
        code: action === "verify" ? verificationCode : undefined,
        consents,
        source,
      }),
    });
    const payload = (await response.json()) as SmsApiResponse;

    if (!response.ok) {
      throw new Error(payload.msg || payload.error || "SMS verification failed.");
    }

    return payload;
  };

  const sendCode = async () => {
    if (!phoneNumber.trim()) {
      setResult({ success: false, message: "Phone number is required." });
      return;
    }
    if (!consents.notifications && !consents.personalStaff) {
      setResult({
        success: false,
        message: "Check the consent box for at least one program before requesting a code.",
      });
      return;
    }

    setLoading(true);
    setResult(null);
    try {
      const payload = await requestVerification("start");
      setStep("code");
      setResult({
        success: true,
        message: payload.msg || "Verification code sent. Check your phone.",
      });
    } catch (error) {
      setResult({
        success: false,
        message: error instanceof Error ? error.message : "Unable to send verification code.",
      });
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async () => {
    if (verificationCode.length !== 6) {
      setResult({ success: false, message: "Enter the six-digit verification code." });
      return;
    }

    setLoading(true);
    setResult(null);
    try {
      const payload = await requestVerification("verify");
      // SMS is now ON for this person, and the send gate is about to start
      // judging their quiet hours. It judges them in UTC unless someone tells
      // it otherwise — which is how 749 of 766 people ended up with texts held
      // back in the middle of their afternoon. The browser knows the answer;
      // offer it at the one moment we are certain SMS matters to them.
      //
      // 🚨 NOT a `timezone` field on the /api/sms/preferences PUT body. That
      // column is NOT NULL with a default of 'America/New_York', so a write
      // there cannot express "only when nothing is known" and would overwrite a
      // timezone the person actually declared. The ONE door is
      // `communication.record_person_timezone`, which decides for itself
      // whether to write. Fire-and-forget: a failure here is never allowed to
      // turn a successful enrolment into an error the person sees.
      void recordBrowserTimezone();
      setPhoneNumber(payload.data?.phoneNumber || phoneNumber);
      setVerificationCode("");
      setEnrolled((previous) => ({
        notifications: previous.notifications || consents.notifications,
        personalStaff: previous.personalStaff || consents.personalStaff,
      }));
      setConsents(NO_PROGRAMS);
      setStep("complete");
      setResult({
        success: true,
        message: payload.msg || "Phone verified and SMS notifications enabled.",
      });
    } catch (error) {
      setResult({
        success: false,
        message: error instanceof Error ? error.message : "Unable to verify that code.",
      });
    } finally {
      setLoading(false);
    }
  };

  const disableSms = async () => {
    setLoading(true);
    setResult(null);
    try {
      const response = await fetchWithOrganization("/api/sms/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sms_enabled: false }),
      });
      const payload = (await response.json()) as SmsApiResponse;
      if (!response.ok) {
        throw new Error(payload.msg || payload.error || "Unable to disable SMS notifications.");
      }

      setConsents(NO_PROGRAMS);
      setEnrolled(NO_PROGRAMS);
      setVerificationCode("");
      setStep("phone");
      setResult({ success: true, message: "All AI Matrx text messages are off for this number." });
    } catch (error) {
      setResult({
        success: false,
        message: error instanceof Error ? error.message : "Unable to disable SMS notifications.",
      });
    } finally {
      setLoading(false);
    }
  };

  const changePhoneNumber = (value: string) => {
    setPhoneNumber(value);
    setResult(null);
  };

  const changeVerificationCode = (value: string) => {
    setVerificationCode(value.replace(/\D/g, "").slice(0, 6));
    setResult(null);
  };

  const setConsent = (program: SmsProgram, value: boolean) => {
    setConsents((previous) => ({ ...previous, [program]: value }));
    setResult(null);
  };

  /** Opt a verified number in to a program it is not yet in: back to the
   *  number step with the number kept and every box unchecked. */
  const addProgram = () => {
    setConsents(NO_PROGRAMS);
    setVerificationCode("");
    setResult(null);
    setStep("phone");
  };

  const reset = () => {
    setStep("phone");
    setVerificationCode("");
    setResult(null);
  };

  return {
    phoneNumber,
    verificationCode,
    consents,
    anyConsent: consents.notifications || consents.personalStaff,
    enrolled,
    personalStaffLegacy,
    step,
    loading,
    result,
    setConsent,
    addProgram,
    changePhoneNumber,
    changeVerificationCode,
    sendCode,
    verifyCode,
    disableSms,
    reset,
  };
}
