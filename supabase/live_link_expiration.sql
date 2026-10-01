-- FrancoTrades Mentoria - expiração do link de aula ao vivo
-- Execute uma única vez no SQL Editor do Supabase.
-- O botão "Entrar na aula ao vivo" fica disponível por 1 hora
-- a partir do momento em que um link novo é salvo para o mentorado.

alter table public.student_sessions
  add column if not exists teams_url_added_at timestamptz;

-- Para links antigos, não existe como recuperar com precisão o momento original
-- em que foram inseridos. Se houver um link antigo sem timestamp, registramos
-- o momento desta migração. A partir daí ele ficará visível por no máximo 1 hora.
update public.student_sessions
set teams_url_added_at = now()
where
  teams_url is not null
  and btrim(teams_url) <> ''
  and teams_url_added_at is null;

create index if not exists student_sessions_live_link_expiration_idx
  on public.student_sessions(teams_url_added_at)
  where teams_url is not null;
