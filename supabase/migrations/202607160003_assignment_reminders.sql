create or replace function private.sync_assignment_reminders()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  preference_record public.user_preferences%rowtype;
  user_timezone text;
  reminder_time timestamptz;
  day_offset integer;
  reminder_clock time;
  reminder_channel text;
begin
  delete from public.reminders
  where assignment_id = new.id and status = 'scheduled';

  if new.due_at is null then
    return new;
  end if;

  select * into preference_record
  from public.user_preferences
  where user_id = new.user_id;

  select timezone into user_timezone
  from public.profiles
  where id = new.user_id;

  user_timezone := coalesce(nullif(user_timezone, ''), 'America/Chicago');

  for day_offset, reminder_clock in
    select * from (values
      (2, preference_record.reminder_two_days),
      (1, preference_record.reminder_one_day),
      (0, preference_record.reminder_due_date)
    ) as reminder_defaults(days_before, local_time)
  loop
    reminder_time := (((new.due_at at time zone user_timezone)::date - day_offset) + reminder_clock) at time zone user_timezone;
    if reminder_time <= now() then
      continue;
    end if;

    foreach reminder_channel in array array['in_app']::text[] loop
      insert into public.reminders (user_id, assignment_id, remind_at, channel)
      values (new.user_id, new.id, reminder_time, reminder_channel);
    end loop;

    if preference_record.email_notifications then
      insert into public.reminders (user_id, assignment_id, remind_at, channel)
      values (new.user_id, new.id, reminder_time, 'email');
    end if;

    if preference_record.browser_notifications then
      insert into public.reminders (user_id, assignment_id, remind_at, channel)
      values (new.user_id, new.id, reminder_time, 'browser');
    end if;
  end loop;

  return new;
end;
$$;

create trigger assignments_sync_reminders
after insert or update of due_at on public.assignments
for each row execute function private.sync_assignment_reminders();

update public.assignments set due_at = due_at where due_at is not null;
