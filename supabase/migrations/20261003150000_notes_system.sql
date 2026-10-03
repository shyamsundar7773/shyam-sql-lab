create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category_id text not null,
  module_id text not null,
  topic_id text not null,
  subtopic_id text not null,
  title text not null,
  content text not null,
  source_type text not null check (source_type in ('Official', 'Manual', 'Imported')),
  source_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index notes_user_updated_idx
  on public.notes (user_id, updated_at desc);

create index notes_user_location_idx
  on public.notes (user_id, category_id, module_id, topic_id, subtopic_id);

create table public.note_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source_name text not null,
  source_type text not null check (source_type in ('TXT', 'Paste')),
  raw_content text not null,
  upload_date timestamptz not null default now(),
  processing_status text not null
    check (processing_status in ('Draft', 'Analyzing', 'Ready for Review', 'Approved', 'Rejected', 'Partially Approved', 'Failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index note_sources_user_upload_idx
  on public.note_sources (user_id, upload_date desc);

alter table public.notes
  add constraint notes_source_id_fkey
  foreign key (source_id) references public.note_sources (id) on delete set null;

create table public.note_import_items (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.note_sources (id) on delete cascade,
  raw_chunk text not null,
  proposed_category_id text not null,
  proposed_module_id text not null,
  proposed_topic_id text not null,
  proposed_subtopic_id text not null,
  proposed_title text not null,
  content text not null default '',
  confidence double precision not null default 0.0,
  mapping_reason text not null default '',
  duplicate_detected boolean not null default false,
  review_status text not null default 'Pending'
    check (review_status in ('Pending', 'Needs Decision', 'Approved', 'Rejected')),
  final_category_id text,
  final_module_id text,
  final_topic_id text,
  final_subtopic_id text,
  approved_by uuid references auth.users (id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index note_import_items_source_review_idx
  on public.note_import_items (source_id, review_status, updated_at desc);

alter table public.notes enable row level security;
alter table public.note_sources enable row level security;
alter table public.note_import_items enable row level security;

create policy "Users can manage their notes"
  on public.notes for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Users can manage their sources"
  on public.note_sources for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Users can read their import items"
  on public.note_import_items for select to authenticated
  using (
    exists (
      select 1 from public.note_sources
      where note_sources.id = note_import_items.source_id
        and note_sources.user_id = (select auth.uid())
    )
  );

create policy "Users can create pending import items"
  on public.note_import_items for insert to authenticated
  with check (
    review_status in ('Pending', 'Needs Decision')
    and exists (
      select 1 from public.note_sources
      where note_sources.id = note_import_items.source_id
        and note_sources.user_id = (select auth.uid())
    )
  );

create policy "Users can edit pending import items"
  on public.note_import_items for update to authenticated
  using (
    review_status in ('Pending', 'Needs Decision')
    and exists (
      select 1 from public.note_sources
      where note_sources.id = note_import_items.source_id
        and note_sources.user_id = (select auth.uid())
    )
  )
  with check (
    review_status in ('Pending', 'Needs Decision', 'Rejected')
    and exists (
      select 1 from public.note_sources
      where note_sources.id = note_import_items.source_id
        and note_sources.user_id = (select auth.uid())
    )
  );

create policy "Users can delete their import items"
  on public.note_import_items for delete to authenticated
  using (
    exists (
      select 1 from public.note_sources
      where note_sources.id = note_import_items.source_id
        and note_sources.user_id = (select auth.uid())
    )
  );

revoke all on public.notes, public.note_sources, public.note_import_items from anon;
grant select, insert, update, delete on public.notes, public.note_sources, public.note_import_items to authenticated;

create or replace function public.approve_note_import_item(p_item_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  import_item public.note_import_items%rowtype;
  source_owner uuid;
  created_note_id uuid;
begin
  select item, source.user_id
    into import_item, source_owner
    from public.note_import_items item
    join public.note_sources source on source.id = item.source_id
    where item.id = p_item_id
    for update of item;

  if import_item.id is null or source_owner is distinct from auth.uid() then
    raise exception 'Import candidate not found.';
  end if;
  if import_item.review_status not in ('Pending', 'Needs Decision') then
    raise exception 'Only pending candidates can be approved.';
  end if;
  if import_item.final_category_id is null
    or import_item.final_module_id is null
    or import_item.final_topic_id is null
    or import_item.final_subtopic_id is null then
    raise exception 'Choose a final Learning Path location before approval.';
  end if;

  update public.note_import_items
    set review_status = 'Approved',
        approved_by = auth.uid(),
        approved_at = now(),
        updated_at = now()
    where id = import_item.id;

  insert into public.notes (
    user_id, category_id, module_id, topic_id, subtopic_id,
    title, content, source_type, source_id
  ) values (
    auth.uid(), import_item.final_category_id, import_item.final_module_id,
    import_item.final_topic_id, import_item.final_subtopic_id,
    import_item.proposed_title, import_item.content, 'Imported', import_item.source_id
  )
  returning id into created_note_id;

  return created_note_id;
end;
$$;

revoke all on function public.approve_note_import_item(uuid) from public, anon;
grant execute on function public.approve_note_import_item(uuid) to authenticated;

create or replace function public.require_approved_imported_note()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.source_type = 'Imported' and (
    new.source_id is null
    or not exists (
      select 1
      from public.note_import_items item
      join public.note_sources source on source.id = item.source_id
      where item.source_id = new.source_id
        and item.review_status = 'Approved'
        and source.user_id = new.user_id
        and item.proposed_title = new.title
        and item.content = new.content
        and item.final_category_id = new.category_id
        and item.final_module_id = new.module_id
        and item.final_topic_id = new.topic_id
        and item.final_subtopic_id = new.subtopic_id
    )
  ) then
    raise exception 'Imported notes require an approved owned import candidate.';
  end if;
  return new;
end;
$$;

create trigger notes_require_approved_import
  before insert or update of source_type, source_id, user_id on public.notes
  for each row execute function public.require_approved_imported_note();

revoke all on function public.require_approved_imported_note() from public, anon, authenticated;

create or replace function public.reject_note_import_item(p_item_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.note_import_items item
    set review_status = 'Rejected', updated_at = now()
    where item.id = p_item_id
      and item.review_status in ('Pending', 'Needs Decision')
      and exists (
        select 1
        from public.note_sources source
        where source.id = item.source_id and source.user_id = auth.uid()
      );

  if not found then
    raise exception 'Pending import candidate not found.';
  end if;
end;
$$;

revoke all on function public.reject_note_import_item(uuid) from public, anon;
grant execute on function public.reject_note_import_item(uuid) to authenticated;
