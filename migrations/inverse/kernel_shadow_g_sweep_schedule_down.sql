-- chair-step: undo kernel_shadow_g_sweep_schedule.sql - stops the scheduled access-kernel drift sweep (the function stays callable)
-- lane: KERNEL-SHADOW
select cron.unschedule('kernel-shadow-sweep');
