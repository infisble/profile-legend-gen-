create extension if not exists vector with schema extensions;

create table if not exists public.client_memory_chunks (
  id uuid primary key default gen_random_uuid(),
  content_hash text not null,
  dialog_key text not null,
  favorite_id text not null,
  client_id text,
  woman_id text,
  source text not null check (
    source in ('profile', 'note', 'conversation', 'letter', 'summary')
  ),
  compose_mode text not null default 'both' check (
    compose_mode in ('reply', 'letter', 'both')
  ),
  source_id text,
  direction text check (direction in ('incoming', 'outgoing')),
  sent_at timestamptz,
  note_date date,
  language text,
  tags text[] not null default '{}',
  text text not null,
  metadata jsonb not null default '{}'::jsonb,
  embedding_model text not null default 'lexical-hash-v1',
  embedding vector(128) not null,
  used_count integer not null default 0,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (dialog_key, content_hash)
);

create index if not exists client_memory_chunks_owner_idx
  on public.client_memory_chunks (dialog_key, favorite_id, client_id, woman_id);

create index if not exists client_memory_chunks_source_idx
  on public.client_memory_chunks (dialog_key, source, sent_at desc);

create index if not exists client_memory_chunks_tags_idx
  on public.client_memory_chunks using gin (tags);

create index if not exists client_memory_chunks_metadata_idx
  on public.client_memory_chunks using gin (metadata);

create index if not exists client_memory_chunks_embedding_idx
  on public.client_memory_chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 64);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists client_memory_chunks_touch_updated_at
  on public.client_memory_chunks;

create trigger client_memory_chunks_touch_updated_at
before update on public.client_memory_chunks
for each row
execute function public.touch_updated_at();

create or replace function public.match_client_memory_chunks(
  query_embedding vector(128),
  match_dialog_key text,
  match_client_id text default null,
  match_compose_mode text default 'reply',
  match_count integer default 12,
  source_weights jsonb default '{"note":1.35,"letter":1.25,"profile":1.15,"conversation":1.0,"summary":1.1}'::jsonb
)
returns table (
  id uuid,
  content_hash text,
  dialog_key text,
  favorite_id text,
  client_id text,
  woman_id text,
  source text,
  compose_mode text,
  source_id text,
  direction text,
  sent_at timestamptz,
  note_date date,
  language text,
  tags text[],
  text text,
  metadata jsonb,
  similarity double precision,
  weighted_score double precision
)
language sql
stable
as $$
  select
    chunk.id,
    chunk.content_hash,
    chunk.dialog_key,
    chunk.favorite_id,
    chunk.client_id,
    chunk.woman_id,
    chunk.source,
    chunk.compose_mode,
    chunk.source_id,
    chunk.direction,
    chunk.sent_at,
    chunk.note_date,
    chunk.language,
    chunk.tags,
    chunk.text,
    chunk.metadata,
    1 - (chunk.embedding <=> query_embedding) as similarity,
    (
      1 - (chunk.embedding <=> query_embedding)
    )
    * coalesce((source_weights ->> chunk.source)::double precision, 1.0)
    * case
        when match_compose_mode = 'letter' and chunk.source = 'letter' then 1.2
        when match_compose_mode = 'letter' and chunk.source = 'note' then 1.15
        when match_compose_mode = 'reply' and chunk.source = 'conversation' then 1.15
        else 1.0
      end
    * case
        when chunk.sent_at is not null and chunk.sent_at > now() - interval '30 days' then 1.1
        else 1.0
      end as weighted_score
  from public.client_memory_chunks chunk
  where chunk.dialog_key = match_dialog_key
    and (match_client_id is null or chunk.client_id = match_client_id)
    and (chunk.compose_mode = 'both' or chunk.compose_mode = match_compose_mode)
  order by weighted_score desc
  limit match_count;
$$;

alter table public.client_memory_chunks enable row level security;

drop policy if exists "service role can manage client memory chunks"
  on public.client_memory_chunks;

create policy "service role can manage client memory chunks"
  on public.client_memory_chunks
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
