-- ProPilot AI · Phase 1b: profile emails for team lists, and invitation acceptance.

-- Keep a copy of the sign-in email on the profile so team lists can show it
-- (auth.users is not readable from the client).
alter table public.profiles add column email text;

update public.profiles p set email = u.email from auth.users u where u.id = p.id;

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), new.email);
  return new;
end;
$$;

-- Accept an invitation. The token itself is only ever in the invite link; the
-- table stores its SHA-256 hash. The signed-in user's email must match the
-- invited email, the invite must be unexpired and unused.
create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  inv public.invitations%rowtype;
  me_email text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into inv from public.invitations
  where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');

  if not found then
    raise exception 'invitation not found';
  end if;
  if inv.accepted_at is not null then
    raise exception 'invitation already used';
  end if;
  if inv.expires_at < now() then
    raise exception 'invitation expired';
  end if;

  select lower(email) into me_email from auth.users where id = auth.uid();
  if me_email is distinct from lower(inv.email) then
    raise exception 'invitation is for a different email address';
  end if;

  insert into public.business_members (business_id, user_id, role)
  values (inv.business_id, auth.uid(), inv.role)
  on conflict (business_id, user_id) do update set role = excluded.role, status = 'active';

  update public.invitations set accepted_at = now() where id = inv.id;

  insert into public.audit_logs (business_id, actor_id, action, target_type, target_id, metadata)
  values (inv.business_id, auth.uid(), 'team.join', 'invitation', inv.id::text,
          jsonb_build_object('role', inv.role));

  return inv.business_id;
end;
$$;

-- Owners and admins can see who was invited before they accept, so the
-- pending list works. (invitations_all already covers this; kept explicit.)

-- Guard role changes made by signed-in users (mirrors canAssignRole() in
-- packages/shared): the owner can't be removed, demoted or deactivated, and an
-- admin may only manage agents and marketing staff. Server-side jobs running
-- without a user (auth.uid() is null) are not restricted here.
create or replace function public.guard_member_changes()
returns trigger
language plpgsql set search_path = public as $$
declare
  actor public.business_role;
begin
  if old.role = 'owner' then
    if tg_op = 'DELETE' or new.role <> 'owner' or new.status <> 'active' then
      raise exception 'the owner cannot be removed, demoted or deactivated';
    end if;
  end if;

  if auth.uid() is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  actor := public.member_role(old.business_id);
  if actor = 'admin' then
    if old.role in ('owner', 'admin') or (tg_op = 'UPDATE' and new.role in ('owner', 'admin')) then
      raise exception 'admins can only manage agents and marketing staff';
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger business_members_guard
  before update or delete on public.business_members
  for each row execute function public.guard_member_changes();

-- Invitations follow the same rule: admins may only invite agents and marketing.
create or replace function public.guard_invitations()
returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null
     and public.member_role(new.business_id) = 'admin'
     and new.role = 'admin' then
    raise exception 'admins can only invite agents and marketing staff';
  end if;
  return new;
end;
$$;

create trigger invitations_guard
  before insert or update on public.invitations
  for each row execute function public.guard_invitations();
