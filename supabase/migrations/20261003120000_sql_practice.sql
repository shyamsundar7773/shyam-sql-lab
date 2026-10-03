create table public.practice_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  config jsonb not null,
  config_fingerprint text not null,
  set_number integer not null check (set_number > 0),
  title text not null,
  current_question_index integer not null default 0 check (current_question_index >= 0),
  bookmarked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint practice_sets_user_config_number_unique
    unique (user_id, config_fingerprint, set_number)
);

create index practice_sets_user_updated_idx
  on public.practice_sets (user_id, updated_at desc);

create table public.practice_questions (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.practice_sets (id) on delete cascade,
  position integer not null check (position between 0 and 9),
  content jsonb not null,
  draft_sql text not null default '',
  status text not null default 'in_progress'
    check (status in ('in_progress', 'completed', 'needs_review')),
  latest_result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint practice_questions_set_position_unique unique (set_id, position)
);

create index practice_questions_set_position_idx
  on public.practice_questions (set_id, position);

create table public.practice_attempts (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.practice_questions (id) on delete cascade,
  sql text not null,
  execution_result jsonb,
  created_at timestamptz not null default now()
);

create index practice_attempts_question_created_idx
  on public.practice_attempts (question_id, created_at desc);

create table public.practice_evaluator_messages (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.practice_questions (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(trim(content)) between 1 and 12000),
  created_at timestamptz not null default now()
);

create index practice_evaluator_messages_question_created_idx
  on public.practice_evaluator_messages (question_id, created_at, id);

alter table public.practice_sets enable row level security;
alter table public.practice_questions enable row level security;
alter table public.practice_attempts enable row level security;
alter table public.practice_evaluator_messages enable row level security;

create policy "Users can manage their practice sets"
  on public.practice_sets for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Users can manage questions in their practice sets"
  on public.practice_questions for all to authenticated
  using (
    exists (
      select 1 from public.practice_sets
      where practice_sets.id = practice_questions.set_id
        and practice_sets.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.practice_sets
      where practice_sets.id = practice_questions.set_id
        and practice_sets.user_id = (select auth.uid())
    )
  );

create policy "Users can manage attempts in their practice sets"
  on public.practice_attempts for all to authenticated
  using (
    exists (
      select 1
      from public.practice_questions
      join public.practice_sets on practice_sets.id = practice_questions.set_id
      where practice_questions.id = practice_attempts.question_id
        and practice_sets.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.practice_questions
      join public.practice_sets on practice_sets.id = practice_questions.set_id
      where practice_questions.id = practice_attempts.question_id
        and practice_sets.user_id = (select auth.uid())
    )
  );

create policy "Users can manage evaluator messages in their practice sets"
  on public.practice_evaluator_messages for all to authenticated
  using (
    exists (
      select 1
      from public.practice_questions
      join public.practice_sets on practice_sets.id = practice_questions.set_id
      where practice_questions.id = practice_evaluator_messages.question_id
        and practice_sets.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.practice_questions
      join public.practice_sets on practice_sets.id = practice_questions.set_id
      where practice_questions.id = practice_evaluator_messages.question_id
        and practice_sets.user_id = (select auth.uid())
    )
  );

revoke all on public.practice_sets, public.practice_questions,
  public.practice_attempts, public.practice_evaluator_messages from anon;
grant select, insert, update, delete on public.practice_sets,
  public.practice_questions, public.practice_attempts,
  public.practice_evaluator_messages to authenticated;

create function public.create_practice_set(
  p_config jsonb,
  p_title text,
  p_questions jsonb
)
returns table (created_set_id uuid, created_set_number integer)
language plpgsql
security invoker
set search_path = public
as $$
declare
  owner_id uuid := auth.uid();
  fingerprint text := md5(p_config::text);
  next_number integer;
  new_set_id uuid;
  question jsonb;
  question_position integer := 0;
begin
  if owner_id is null then
    raise exception 'Authentication is required.';
  end if;
  if jsonb_typeof(p_config) <> 'object'
    or jsonb_typeof(p_questions) <> 'array'
    or jsonb_array_length(p_questions) not between 1 and 10
    or char_length(trim(p_title)) not between 1 and 160 then
    raise exception 'Invalid practice set configuration or question list.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(owner_id::text || fingerprint, 0));
  select coalesce(max(ps.set_number), 0) + 1
    into next_number
    from public.practice_sets ps
    where ps.user_id = owner_id
      and ps.config_fingerprint = fingerprint;

  insert into public.practice_sets (
    user_id, config, config_fingerprint, set_number, title
  ) values (
    owner_id, p_config, fingerprint, next_number, trim(p_title)
  )
  returning id into new_set_id;

  for question in select value from jsonb_array_elements(p_questions)
  loop
    insert into public.practice_questions (set_id, position, content)
    values (new_set_id, question_position, question);
    question_position := question_position + 1;
  end loop;

  return query select new_set_id, next_number;
end;
$$;

revoke all on function public.create_practice_set(jsonb, text, jsonb) from public, anon;
grant execute on function public.create_practice_set(jsonb, text, jsonb) to authenticated;
