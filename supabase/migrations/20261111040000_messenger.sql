-- ProPilot AI · Messenger inquiries on connected Facebook Pages.
--
-- People who message a connected Page get AI replies about the business's
-- listings until someone on the team takes over. Everything here is written by
-- the server (the Messenger webhook and server actions); the owner, admins and
-- agents can read their business's conversations.

alter table public.facebook_pages
  add column if not exists messenger_enabled boolean not null default false,
  add column if not exists messenger_subscribed_at timestamptz;

create table if not exists public.messenger_conversations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  page_row_id uuid not null references public.facebook_pages (id) on delete cascade,
  page_id text not null,
  psid text not null check (psid ~ '^[0-9]{1,40}$'),
  display_name text check (char_length(display_name) <= 120),
  -- 'ai': the assistant replies. 'human': someone on the team has taken over.
  mode text not null default 'ai' check (mode in ('ai', 'human')),
  taken_over_by uuid references auth.users (id) on delete set null,
  needs_attention boolean not null default false,
  attention_reason text check (char_length(attention_reason) <= 300),
  -- What the assistant gathered for a viewing request.
  lead_name text check (char_length(lead_name) <= 120),
  lead_phone text check (char_length(lead_phone) <= 40),
  lead_date date,
  lead_notes text check (char_length(lead_notes) <= 500),
  property_id uuid references public.properties (id) on delete set null,
  lead_status text not null default 'none' check (lead_status in ('none', 'new', 'contacted', 'scheduled', 'closed')),
  last_inbound_at timestamptz,
  last_message_at timestamptz not null default now(),
  last_read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (page_id, psid)
);
create index if not exists messenger_conversations_business on public.messenger_conversations (business_id, last_message_at desc);
alter table public.messenger_conversations enable row level security;

create table if not exists public.messenger_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.messenger_conversations (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  -- buyer: the person messaging the Page. ai: ProPilot's assistant.
  -- agent: a teammate replying in ProPilot. page: someone replying in Facebook's own inbox.
  sender text not null check (sender in ('buyer', 'ai', 'agent', 'page')),
  sent_by uuid references auth.users (id) on delete set null,
  body text not null check (char_length(body) <= 4000),
  mid text unique,
  created_at timestamptz not null default now()
);
create index if not exists messenger_messages_conversation on public.messenger_messages (conversation_id, created_at);
alter table public.messenger_messages enable row level security;

-- Who reads conversations: the roles that can reply (owner, admin, agent).
drop policy if exists messenger_conversations_select on public.messenger_conversations;
create policy messenger_conversations_select on public.messenger_conversations
  for select to authenticated
  using (public.has_role(business_id, array['owner', 'admin', 'agent']::public.business_role[]));

drop policy if exists messenger_messages_select on public.messenger_messages;
create policy messenger_messages_select on public.messenger_messages
  for select to authenticated
  using (public.has_role(business_id, array['owner', 'admin', 'agent']::public.business_role[]));

-- Settings members may see for each connected Page (still no tokens).
drop function if exists public.business_facebook_pages(uuid);
create or replace function public.business_facebook_pages(p_business_id uuid)
returns table (id uuid, page_id text, name text, tasks text[], connected_at timestamptz, messenger_enabled boolean)
language sql stable security definer set search_path = public as $$
  select id, page_id, name, tasks, connected_at, messenger_enabled
  from public.facebook_pages
  where business_id = p_business_id and public.is_member(p_business_id)
  order by name
$$;
grant execute on function public.business_facebook_pages(uuid) to authenticated;

-- Retention: conversations with no messages for 12 months are deleted.
create or replace function public.prune_messenger()
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    raise exception 'permission denied for function prune_messenger';
  end if;
  delete from public.messenger_conversations where last_message_at < now() - interval '12 months';
end;
$$;
revoke execute on function public.prune_messenger() from public, authenticated;
