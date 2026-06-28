-- Migration: scheduler_tables_schema_move
-- Move all 4 sch_* tables to scheduler schema
-- FK constraints between these tables are preserved automatically

ALTER TABLE public.sch_task SET SCHEMA scheduler;
ALTER TABLE public.sch_trigger SET SCHEMA scheduler;
ALTER TABLE public.sch_run SET SCHEMA scheduler;
ALTER TABLE public.sch_agent_task SET SCHEMA scheduler;
