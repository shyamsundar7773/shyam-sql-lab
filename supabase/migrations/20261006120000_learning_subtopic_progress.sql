create table public.learning_subtopic_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  category_id text not null,
  topic_id text not null,
  subtopic_id text not null,
  follow_up_count integer not null check (follow_up_count > 0),
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint learning_subtopic_progress_user_path_unique
    unique (user_id, category_id, topic_id, subtopic_id)
);

create table public.learning_subtopic_progress_events (
  user_message_id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  conversation_id uuid not null
    references public.learning_conversations (id) on delete cascade,
  category_id text not null,
  topic_id text not null,
  subtopic_id text not null,
  accepted_at timestamptz not null default now()
);

create index learning_subtopic_progress_events_conversation_idx
  on public.learning_subtopic_progress_events (conversation_id);

alter table public.learning_subtopic_progress enable row level security;
alter table public.learning_subtopic_progress_events enable row level security;

create policy "Users can read their subtopic learning progress"
  on public.learning_subtopic_progress for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.learning_subtopic_progress,
  public.learning_subtopic_progress_events from public, anon;
grant select on public.learning_subtopic_progress to authenticated;

create function public.record_learning_subtopic_progress(
  p_conversation_id uuid,
  p_user_message_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_category_id text;
  v_topic_id text;
  v_subtopic_id text;
  v_recorded_message_id uuid;
  v_existing_event record;
  v_follow_up_count integer;
begin
  if v_user_id is null then
    raise exception 'A signed-in user is required to record learning progress.';
  end if;

  select conversation.category_id, conversation.topic_id, conversation.subtopic_id
    into v_category_id, v_topic_id, v_subtopic_id
  from public.learning_conversations as conversation
  where conversation.id = p_conversation_id
    and conversation.user_id = v_user_id
    and conversation.module_id is null
    and conversation.subtopic_id is not null;

  if not found then
    raise exception 'The conversation does not belong to the signed-in user and a canonical Subtopic.';
  end if;

  if not exists (
    select 1
    from public.learning_chat_messages as message
    where message.id = p_user_message_id
      and message.conversation_id = p_conversation_id
      and message.role = 'user'
  ) then
    raise exception 'The progress event must reference a user message in the selected conversation.';
  end if;

  insert into public.learning_subtopic_progress_events (
    user_message_id,
    user_id,
    conversation_id,
    category_id,
    topic_id,
    subtopic_id
  )
  values (
    p_user_message_id,
    v_user_id,
    p_conversation_id,
    v_category_id,
    v_topic_id,
    v_subtopic_id
  )
  on conflict (user_message_id) do nothing
  returning user_message_id into v_recorded_message_id;

  if v_recorded_message_id is null then
    select event.user_id, event.conversation_id, event.category_id, event.topic_id, event.subtopic_id
      into v_existing_event
    from public.learning_subtopic_progress_events as event
    where event.user_message_id = p_user_message_id;

    if v_existing_event.user_id is distinct from v_user_id
      or v_existing_event.conversation_id is distinct from p_conversation_id
      or v_existing_event.category_id is distinct from v_category_id
      or v_existing_event.topic_id is distinct from v_topic_id
      or v_existing_event.subtopic_id is distinct from v_subtopic_id then
      raise exception 'A user message cannot be reused for a different learning context.';
    end if;

    select progress.follow_up_count into v_follow_up_count
    from public.learning_subtopic_progress as progress
    where progress.user_id = v_user_id
      and progress.category_id = v_category_id
      and progress.topic_id = v_topic_id
      and progress.subtopic_id = v_subtopic_id;

    return v_follow_up_count;
  end if;

  insert into public.learning_subtopic_progress (
    user_id,
    category_id,
    topic_id,
    subtopic_id,
    follow_up_count
  )
  values (v_user_id, v_category_id, v_topic_id, v_subtopic_id, 1)
  on conflict (user_id, category_id, topic_id, subtopic_id)
  do update set
    follow_up_count = public.learning_subtopic_progress.follow_up_count + 1,
    updated_at = now()
  returning follow_up_count into v_follow_up_count;

  return v_follow_up_count;
end;
$$;

revoke all on function public.record_learning_subtopic_progress(uuid, uuid)
  from public, anon;
grant execute on function public.record_learning_subtopic_progress(uuid, uuid)
  to authenticated;
