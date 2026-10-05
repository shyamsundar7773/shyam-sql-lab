alter table public.learning_conversations
  alter column module_id drop not null;

create unique index learning_conversations_user_category_topic_without_module_unique
  on public.learning_conversations (user_id, category_id, topic_id)
  where module_id is null;
