alter table public.learning_conversations
  add column if not exists subtopic_id text;

drop index if exists public.learning_conversations_user_category_topic_without_module_unique;

create unique index if not exists learning_conversations_legacy_user_category_topic_without_subtopic_unique
  on public.learning_conversations (user_id, category_id, topic_id)
  where module_id is null and subtopic_id is null;

create unique index if not exists learning_conversations_user_canonical_subtopic_unique
  on public.learning_conversations (user_id, category_id, topic_id, subtopic_id)
  where module_id is null and subtopic_id is not null;
