-- Explicitly opening a review is separate from seeing its card or completing it.
create table if not exists public.trade_review_reads (
  student_id uuid not null references public.profiles(id) on delete cascade,
  review_type text not null check (review_type in ('analysis', 'video')),
  review_id bigint not null,
  first_opened_at timestamptz not null default now(),
  primary key (student_id, review_type, review_id)
);
alter table public.trade_review_reads enable row level security;
revoke all on public.trade_review_reads from public, anon, authenticated;
grant select, insert on public.trade_review_reads to authenticated;
grant all on public.trade_review_reads to service_role;

drop policy if exists "Students read own opened reviews" on public.trade_review_reads;
create policy "Students read own opened reviews"
  on public.trade_review_reads for select to authenticated
  using (student_id = (select auth.uid()));

drop policy if exists "Students record eligible review opens" on public.trade_review_reads;
create policy "Students record eligible review opens"
  on public.trade_review_reads for insert to authenticated
  with check (
    student_id = (select auth.uid())
    and (
      (
        review_type = 'analysis'
        and (select public.can_access_trade_analysis_reviews())
        and exists (
          select 1 from public.trade_analysis_reviews r
          where r.id = review_id and r.ativo = true
        )
      )
      or (
        review_type = 'video'
        and (select public.can_access_trade_video_reviews())
        and exists (
          select 1 from public.trade_reviews r
          where r.id = review_id and r.ativo = true
        )
      )
    )
  );

notify pgrst, 'reload schema';
