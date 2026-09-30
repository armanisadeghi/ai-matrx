/**
 * SMS Service Types
 *
 * Internal types for the SMS service layer.
 * Database/feature types live in features/sms/types.ts
 */

export interface SendSmsOptions {
  to: string;
  body: string;
  from?: string;
  mediaUrl?: string[];
  statusCallback?: string;
  messagingServiceSid?: string;
}

export interface SendSmsResult {
  success: boolean;
  sid?: string;
  status?: string;
  error?: string;
  errorCode?: string;
}

export interface InboundSmsPayload {
  MessageSid: string;
  AccountSid: string;
  MessagingServiceSid?: string;
  From: string;
  To: string;
  Body: string;
  NumMedia: string;
  NumSegments: string;
  SmsStatus: string;
  ApiVersion: string;
  // Media fields (0-indexed: MediaUrl0, MediaContentType0, etc.)
  [key: string]: string | undefined;
}

export interface StatusCallbackPayload {
  MessageSid: string;
  MessageStatus: string;
  AccountSid: string;
  From: string;
  To: string;
  ErrorCode?: string;
  ErrorMessage?: string;
  ApiVersion: string;
}

export interface TwilioMediaAttachment {
  url: string;
  contentType: string;
  index: number;
}

export interface PhoneNumberPurchaseOptions {
  areaCode?: string;
  country?: string;
  smsEnabled?: boolean;
  mmsEnabled?: boolean;
  voiceEnabled?: boolean;
}

export interface PhoneNumberInfo {
  sid: string;
  phoneNumber: string;
  friendlyName: string;
  capabilities: {
    sms: boolean;
    mms: boolean;
    voice: boolean;
  };
}

export interface VerificationResult {
  success: boolean;
  status?: string;
  error?: string;
  /** `suppressed_on_clone` when the outbound guard refused (lib/communications/outbound-guard.ts). */
  errorCode?: string;
}

export type SmsDirection = 'inbound' | 'outbound';
export type SmsStatus = 'queued' | 'accepted' | 'sending' | 'sent' | 'delivered' | 'undelivered' | 'failed' | 'received' | 'read';
export type ConversationType = 'user_initiated' | 'system_initiated' | 'ai_agent' | 'admin' | 'notification';
export type NotificationType = 'dm_notification' | 'task_assignment' | 'task_due_date' | 'job_complete' | 'system_alert' | 'verification' | 'marketing' | 'ai_agent_response' | 'admin_message' | 'custom';
