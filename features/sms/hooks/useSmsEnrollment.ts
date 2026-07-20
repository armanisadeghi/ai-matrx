"use client";

import { useEffect, useState } from "react";

type EnrollmentStep = "phone" | "code" | "complete";

type SmsPreferences = {
  phone_number?: string | null;
  sms_enabled?: boolean;
  sms_consent_status?: string | null;
};

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
 * Owns the canonical SMS enrollment flow: explicit consent, Verify OTP,
 * enrollment status hydration, and web-form opt-out.
 */
export function useSmsEnrollment(source: "settings" | "sms-demo") {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [step, setStep] = useState<EnrollmentStep>("phone");
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<SmsEnrollmentResult | null>(null);

  useEffect(() => {
    let active = true;

    const loadEnrollment = async () => {
      try {
        const response = await fetch("/api/sms/preferences");
        const payload = (await response.json()) as SmsApiResponse;
        if (!active) return;

        const preferences = payload.data;
        if (
          response.ok &&
          preferences?.sms_enabled &&
          preferences.sms_consent_status === "opted_in" &&
          preferences.phone_number
        ) {
          setPhoneNumber(preferences.phone_number);
          setConsentAccepted(true);
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
    const response = await fetch("/api/sms/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        phoneNumber,
        code: action === "verify" ? verificationCode : undefined,
        consentAccepted,
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
    if (!consentAccepted) {
      setResult({
        success: false,
        message: "Accept the SMS disclosure before requesting a verification code.",
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
      setPhoneNumber(payload.data?.phoneNumber || phoneNumber);
      setVerificationCode("");
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
      const response = await fetch("/api/sms/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sms_enabled: false }),
      });
      const payload = (await response.json()) as SmsApiResponse;
      if (!response.ok) {
        throw new Error(payload.msg || payload.error || "Unable to disable SMS notifications.");
      }

      setConsentAccepted(false);
      setVerificationCode("");
      setStep("phone");
      setResult({ success: true, message: "SMS notifications disabled." });
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

  const reset = () => {
    setStep("phone");
    setVerificationCode("");
    setResult(null);
  };

  return {
    phoneNumber,
    verificationCode,
    consentAccepted,
    step,
    loading,
    result,
    setConsentAccepted,
    changePhoneNumber,
    changeVerificationCode,
    sendCode,
    verifyCode,
    disableSms,
    reset,
  };
}
