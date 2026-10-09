-- chair-step: undo memosweep_c - stops the scheduled memo sweep (the function stays callable)
-- lane: MEMO-SWEEP
select cron.unschedule('kernel-memo-sweep');
