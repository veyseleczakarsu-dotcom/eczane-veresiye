-- Vade ayarlarını güvenli biçimde günceller.
-- Supabase SQL Editor'da bir kez çalıştırılmalıdır.
create or replace function public.update_customer_timing_v1(
  p_customer_id uuid,
  p_due_days integer,
  p_auto_charge_days integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_due integer;
  v_auto integer;
  v_updated integer;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.app_users
    where user_id = v_uid and coalesce(is_active, true) = true
  ) then
    raise exception 'active staff required' using errcode = '42501';
  end if;

  v_due := greatest(1, least(45, coalesce(p_due_days, 30)));
  v_auto := greatest(1, least(45, coalesce(p_auto_charge_days, 30)));

  update public.customers
     set due_days = v_due,
         auto_charge_days = v_auto,
         updated_at = now()
   where id = p_customer_id;
  if not found then
    raise exception 'customer not found' using errcode = 'P0002';
  end if;

  update public.credit_transactions
     set due_days = v_due,
         auto_charge_days = v_auto,
         updated_at = now()
   where customer_id = p_customer_id and status = 'open';
  get diagnostics v_updated = row_count;

  return jsonb_build_object(
    'customer_id', p_customer_id,
    'due_days', v_due,
    'auto_charge_days', v_auto,
    'updated_transactions', v_updated
  );
end;
$$;

revoke all on function public.update_customer_timing_v1(uuid, integer, integer) from public;
revoke execute on function public.update_customer_timing_v1(uuid, integer, integer) from anon;
grant execute on function public.update_customer_timing_v1(uuid, integer, integer) to authenticated;
