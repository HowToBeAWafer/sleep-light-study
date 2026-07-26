begin;

-- Additive credential upgrade for profiles created by the earlier recovery-code
-- version. Historical sessions, surveys, feedback, and build-version fields are
-- not changed. The browser derives a slow PBKDF2 proof from the new password;
-- neither the password nor its raw text is sent to PostgreSQL.
create or replace function public.upgrade_participant_profile_credential(
  participant_name text,
  current_recovery_proof text,
  new_credential_proof text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  canonical_name text;
  profile_record private.participant_profiles%rowtype;
  new_hash bytea;
begin
  if participant_name is null
    or octet_length(participant_name) > 512
    or current_recovery_proof is null
    or current_recovery_proof !~ '^[0-9A-Fa-f]{64}$'
    or new_credential_proof is null
    or new_credential_proof !~ '^[0-9A-Fa-f]{64}$'
  then
    raise exception 'The study name or credential proof is not valid.' using errcode = '22023';
  end if;

  canonical_name := private.canonical_participant_name(participant_name);
  if char_length(canonical_name) not between 1 and 80
    or canonical_name ~ '[[:cntrl:]]'
  then
    raise exception 'The study name or credential proof is not valid.' using errcode = '22023';
  end if;

  select existing.* into profile_record
  from private.participant_profiles as existing
  where existing.normalized_name = private.participant_name_key(canonical_name)
    and existing.recovery_code_hash = private.participant_recovery_hash(current_recovery_proof)
  for update;

  if profile_record.profile_id is null then
    raise exception 'The study name and original recovery code did not match.' using errcode = '28000';
  end if;

  new_hash := private.participant_recovery_hash(new_credential_proof);
  begin
    update private.participant_profiles as existing
    set recovery_code_hash = new_hash,
        last_accessed_at = clock_timestamp()
    where existing.profile_id = profile_record.profile_id
    returning existing.* into profile_record;
  exception
    when unique_violation then
      raise exception 'The new participant credential could not be used.' using errcode = '23505';
  end;

  return pg_catalog.jsonb_build_object(
    'profileId', profile_record.profile_id,
    'displayName', profile_record.display_name,
    'createdAt', profile_record.created_at,
    'lastAccessedAt', profile_record.last_accessed_at
  );
end;
$$;

revoke all on function public.upgrade_participant_profile_credential(text, text, text)
  from public, anon, authenticated;
grant execute on function public.upgrade_participant_profile_credential(text, text, text)
  to anon;

commit;
