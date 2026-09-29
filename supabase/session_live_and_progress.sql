-- FrancoTrades Mentoria - progresso único por sessão + link de aula ao vivo
-- Execute uma única vez no SQL Editor do Supabase.

with ranked as (
  select
    ctid,
    row_number() over (
      partition by student_id, session_id
      order by
        concluida desc,
        updated_at desc nulls last,
        ctid desc
    ) as rn
  from public.student_progress
)
delete from public.student_progress sp
using ranked r
where sp.ctid = r.ctid
  and r.rn > 1;

create unique index if not exists student_progress_student_session_unique
  on public.student_progress(student_id, session_id);

alter table public.student_sessions
  add column if not exists teams_url text;


-- Horário previsto da sessão (horário de Brasília).
alter table public.student_sessions
  add column if not exists session_time time;
