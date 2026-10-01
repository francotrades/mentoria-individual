-- FrancoTrades — acesso às revisões baseado em GRAVAÇÕES
-- Execute este arquivo uma única vez no SQL Editor do Supabase.
--
-- Regra normal:
-- • Revisões em vídeo e análises são liberadas quando existem gravações
--   (youtube_url) das sessões 1 a 8.
-- • A área de análises com imagem é encerrada quando a gravação da última
--   sessão contratada (12ª ou 13ª) é cadastrada.
-- • A liberação antecipada individual continua podendo antecipar a entrada,
--   mas não impede o encerramento quando a gravação da última sessão é cadastrada.

create or replace function public.can_access_trade_video_reviews()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'aluno'
      and p.status = 'ativo'
      and (
        p.data_expiracao is null
        or p.data_expiracao >= current_date
      )
      and (
        public.has_trade_review_early_access(p.id)
        or (
          select count(distinct s.numero)
          from public.student_sessions ss
          join public.sessions s
            on s.id = ss.session_id
          where ss.student_id = p.id
            and nullif(btrim(coalesce(ss.youtube_url, '')), '') is not null
            and s.numero between 1 and 8
        ) = 8
      )
  );
$$;

drop policy if exists "Alunos elegiveis visualizam revisoes de trades"
  on public.trade_reviews;

create policy "Alunos elegiveis visualizam revisoes de trades"
on public.trade_reviews
for select
to authenticated
using (
  ativo = true
  and public.can_access_trade_video_reviews()
);

create or replace function public.can_access_trade_analysis_reviews()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'aluno'
      and p.status = 'ativo'
      and (
        p.data_expiracao is null
        or p.data_expiracao >= current_date
      )
      and (
        public.has_trade_review_early_access(p.id)
        or (
          select count(distinct s.numero)
          from public.student_sessions ss
          join public.sessions s
            on s.id = ss.session_id
          where ss.student_id = p.id
            and nullif(btrim(coalesce(ss.youtube_url, '')), '') is not null
            and s.numero between 1 and 8
        ) = 8
      )
      and not exists (
        select 1
        from public.student_sessions ss_last
        join public.sessions s_last
          on s_last.id = ss_last.session_id
        where ss_last.student_id = p.id
          and nullif(btrim(coalesce(ss_last.youtube_url, '')), '') is not null
          and s_last.numero = greatest(
            12,
            coalesce(
              (
                select mf.quantidade_sessoes
                from public.mentorship_financials mf
                where
                  mf.profile_id = p.id
                  or lower(coalesce(mf.email, '')) = lower(coalesce(p.email, ''))
                order by
                  case when mf.profile_id = p.id then 0 else 1 end,
                  mf.id
                limit 1
              ),
              12
            ),
            coalesce(
              (
                select max(s_contract.numero)
                from public.student_sessions ss_contract
                join public.sessions s_contract
                  on s_contract.id = ss_contract.session_id
                where ss_contract.student_id = p.id
              ),
              0
            )
          )
      )
  );
$$;

drop policy if exists "Alunos elegiveis visualizam analises de trades"
  on public.trade_analysis_reviews;

create policy "Alunos elegiveis visualizam analises de trades"
on public.trade_analysis_reviews
for select
to authenticated
using (
  ativo = true
  and public.can_access_trade_analysis_reviews()
);

drop policy if exists "Alunos elegiveis visualizam imagens das analises"
  on storage.objects;

create policy "Alunos elegiveis visualizam imagens das analises"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'trade-review-images'
  and public.can_access_trade_analysis_reviews()
);
