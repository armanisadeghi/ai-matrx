-- e-sign parity §8.2 / A-R4: the "text me a link" SMS (esign.signature_handoff) rides AI Matrx's own
-- first-party sender (+1 415 949 3803, campaign QE2c6890da8086d771620e9b13fadeba0b, Low Volume Mixed,
-- VERIFIED 2026-09-21 — aidream sender_programs.FIRST_PARTY_SENDER_PROGRAM_KEY): a one-time link the
-- person asked for, to their own phone, about the product's own work. Without a program the
-- dispatcher refused it (sms_sender_program_unconfigured), as it should.
update communication.notification_event_type
   set config = config || jsonb_build_object('sender_program_key', 'ai_matrx_first_party')
 where event_key = 'esign.signature_handoff' and not (config ? 'sender_program_key');
