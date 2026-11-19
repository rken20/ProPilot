-- Home Finder AI · The app was renamed from ProPilot AI.
-- Timeline messages written by the database use the new name; existing ones are updated too.

create or replace function public.prospects_log()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  who uuid := case when public.is_member(new.business_id) then auth.uid() end;
begin
  if tg_op = 'INSERT' then
    insert into public.prospect_events (business_id, prospect_id, kind, body, actor)
    values (new.business_id, new.id, 'created', case new.source
      when 'viewing_request' then 'New lead from a viewing request'
      when 'messenger' then 'New lead from Messenger'
      when 'app_chat' then 'New lead from a Home Finder chat'
      else 'Added by hand' end, who);
    return new;
  end if;
  if new.stage is distinct from old.stage then
    insert into public.prospect_events (business_id, prospect_id, kind, body, actor)
    values (new.business_id, new.id, 'stage',
      'Moved to ' || public.prospect_stage_label(new.stage)
        || case when new.stage = 'lost' and new.lost_reason is not null then ': ' || new.lost_reason else '' end,
      who);
  end if;
  if new.assigned_to is distinct from old.assigned_to then
    insert into public.prospect_events (business_id, prospect_id, kind, body, actor)
    values (new.business_id, new.id, 'assigned',
      coalesce('Assigned to ' || (select nullif(full_name, '') from public.profiles where id = new.assigned_to), case when new.assigned_to is null then 'Unassigned' else 'Assigned' end),
      who);
  end if;
  return new;
end;
$$;

create or replace function public.messenger_conversations_pipeline()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and auth.uid() is not null and new.prospect_id is not null then
    new.prospect_id := old.prospect_id;
  end if;

  if new.prospect_id is null then
    -- Only on first contact, so a prospect the team deleted doesn't come back with the next message.
    if tg_op = 'INSERT' and new.channel = 'app' and new.buyer_id is not null then
      -- A ProPilot buyer who starts a chat is an inquiry straight away.
      new.prospect_id := public.pipeline_buyer_prospect(new.business_id, new.buyer_id, 'app_chat',
        coalesce(new.lead_name, (select full_name from public.profiles where id = new.buyer_id)), new.lead_phone, new.property_id);
      insert into public.prospect_events (business_id, prospect_id, kind, body)
      values (new.business_id, new.prospect_id, 'chat', 'Started a chat in Home Finder');
    elsif new.channel = 'messenger' and new.lead_status <> 'none' and (tg_op = 'INSERT' or old.lead_status = 'none') then
      -- Messenger visitors join the pipeline once the AI or the team records them as a lead.
      insert into public.prospects (business_id, source, name, phone, property_id)
      values (new.business_id, 'messenger', left(coalesce(new.lead_name, new.display_name), 120), left(new.lead_phone, 40), new.property_id)
      returning id into new.prospect_id;
      insert into public.prospect_events (business_id, prospect_id, kind, body)
      values (new.business_id, new.prospect_id, 'chat', 'Asked about a viewing on Messenger');
    end if;
    if new.prospect_id is not null and new.lead_status in ('scheduled', 'closed') then
      perform public.pipeline_advance(new.prospect_id, 'viewing');
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE'
     and (new.lead_name, new.lead_phone, new.property_id, new.lead_status)
         is distinct from (old.lead_name, old.lead_phone, old.property_id, old.lead_status) then
    update public.prospects set
      name = coalesce(name, left(new.lead_name, 120)),
      phone = coalesce(phone, left(new.lead_phone, 40)),
      property_id = coalesce(property_id, new.property_id)
    where id = new.prospect_id;
    if new.lead_status is distinct from old.lead_status then
      if new.lead_status = 'new' then
        insert into public.prospect_events (business_id, prospect_id, kind, body)
        values (new.business_id, new.prospect_id, 'chat', 'Asked for a viewing in chat');
        update public.prospects set last_activity_at = now() where id = new.prospect_id;
      elsif new.lead_status = 'scheduled' then
        perform public.pipeline_advance(new.prospect_id, 'viewing');
      end if;
    end if;
  end if;
  return new;
end;
$$;

update public.prospect_events set body = replace(body, 'ProPilot', 'Home Finder') where body like '%ProPilot%';
