create table public.learning_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category_id text not null,
  module_id text not null,
  topic_id text not null,
  lesson_content jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint learning_conversations_user_topic_path_unique
    unique (user_id, category_id, module_id, topic_id)
);

create table public.learning_chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.learning_conversations (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(trim(content)) between 1 and 12000),
  created_at timestamptz not null default now()
);

create index learning_chat_messages_conversation_created_idx
  on public.learning_chat_messages (conversation_id, created_at, id);

alter table public.learning_conversations enable row level security;
alter table public.learning_chat_messages enable row level security;

create policy "Users can read their learning conversations"
  on public.learning_conversations for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Users can create their learning conversations"
  on public.learning_conversations for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "Users can update their learning conversations"
  on public.learning_conversations for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Users can delete their learning conversations"
  on public.learning_conversations for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "Users can read messages in their conversations"
  on public.learning_chat_messages for select to authenticated
  using (
    exists (
      select 1
      from public.learning_conversations
      where learning_conversations.id = learning_chat_messages.conversation_id
        and learning_conversations.user_id = (select auth.uid())
    )
  );

create policy "Users can add messages to their conversations"
  on public.learning_chat_messages for insert to authenticated
  with check (
    exists (
      select 1
      from public.learning_conversations
      where learning_conversations.id = learning_chat_messages.conversation_id
        and learning_conversations.user_id = (select auth.uid())
    )
  );

create policy "Users can update messages in their conversations"
  on public.learning_chat_messages for update to authenticated
  using (
    exists (
      select 1
      from public.learning_conversations
      where learning_conversations.id = learning_chat_messages.conversation_id
        and learning_conversations.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.learning_conversations
      where learning_conversations.id = learning_chat_messages.conversation_id
        and learning_conversations.user_id = (select auth.uid())
    )
  );

create policy "Users can delete messages in their conversations"
  on public.learning_chat_messages for delete to authenticated
  using (
    exists (
      select 1
      from public.learning_conversations
      where learning_conversations.id = learning_chat_messages.conversation_id
        and learning_conversations.user_id = (select auth.uid())
    )
  );

revoke all on public.learning_conversations, public.learning_chat_messages from anon;
grant select, insert, update, delete
  on public.learning_conversations, public.learning_chat_messages to authenticated;

create function public.touch_learning_conversation_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    update public.learning_conversations
    set updated_at = now()
    where id = old.conversation_id;
    return old;
  end if;

  update public.learning_conversations
  set updated_at = now()
  where id = new.conversation_id;
  return new;
end;
$$;

revoke all on function public.touch_learning_conversation_updated_at() from public, anon, authenticated;

create trigger learning_chat_messages_touch_conversation
  after insert or update or delete on public.learning_chat_messages
  for each row execute function public.touch_learning_conversation_updated_at();
