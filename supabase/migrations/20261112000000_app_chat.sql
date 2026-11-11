-- ProPilot AI · In-app chat between ProPilot buyers and a business.
--
-- The same conversations and inbox as Messenger, with channel 'app': the buyer
-- is a signed-in ProPilot user instead of a Facebook Page visitor. The AI
-- answers first and the team can take over. Buyers read their own chats only
-- through the functions below, which leave out the team's internal fields.

alter table public.messenger_conversations
  add column if not exists channel text not null default 'messenger',
  add column if not exists buyer_id uuid references auth.users (id) on delete cascade;

alter table public.messenger_conversations alter column page_row_id drop not null;
alter table public.messenger_conversations alter column page_id drop not null;
alter table public.messenger_conversations alter column psid drop not null;

alter table public.messenger_conversations drop constraint if exists messenger_conversations_channel_check;
alter table public.messenger_conversations add constraint messenger_conversations_channel_check check (
  (channel = 'messenger' and page_row_id is not null and page_id is not null and psid is not null and buyer_id is null)
  or (channel = 'app' and buyer_id is not null and page_row_id is null and psid is null)
);

-- One in-app conversation per buyer per business.
create unique index if not exists messenger_conversations_app_buyer
  on public.messenger_conversations (business_id, buyer_id) where channel = 'app';

-- The buyer's own in-app conversations (no internal notes, lead fields or who took over).
create or replace function public.my_app_conversations()
returns table (id uuid, business_name text, property_id uuid, property_name text, last_message_at timestamptz, last_message text, last_sender text)
language sql stable security definer set search_path = public as $$
  select c.id, b.name, c.property_id, p.name, c.last_message_at,
         (select m.body from public.messenger_messages m where m.conversation_id = c.id order by m.created_at desc limit 1),
         (select m.sender from public.messenger_messages m where m.conversation_id = c.id order by m.created_at desc limit 1)
  from public.messenger_conversations c
  join public.businesses b on b.id = c.business_id
  left join public.properties p on p.id = c.property_id
  where c.channel = 'app' and c.buyer_id = auth.uid()
  order by c.last_message_at desc
$$;
grant execute on function public.my_app_conversations() to authenticated;

create or replace function public.my_app_messages(p_conversation uuid)
returns table (id uuid, sender text, body text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.id, m.sender, m.body, m.created_at
  from public.messenger_messages m
  join public.messenger_conversations c on c.id = m.conversation_id
  where m.conversation_id = p_conversation and c.channel = 'app' and c.buyer_id = auth.uid()
  order by m.created_at
  limit 500
$$;
grant execute on function public.my_app_messages(uuid) to authenticated;
