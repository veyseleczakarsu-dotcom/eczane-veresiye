-- Fiş/fatura durumunu yalnızca aktif personelin değiştirebilmesi için dar RPC.
-- Supabase SQL Editor'da bir kez çalıştırın.

create or replace function public.update_payment_receipt_v1(
  p_payment_id uuid,
  p_receipt_issued boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_confirmed_at timestamptz := case when p_receipt_issued then now() else null end;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.app_users
    where user_id = v_uid
      and coalesce(is_active, true) = true
  ) then
    raise exception 'active staff required' using errcode = '42501';
  end if;

  update public.payments
     set receipt_issued = p_receipt_issued,
         receipt_confirmed_at = v_confirmed_at
   where id = p_payment_id;

  if not found then
    raise exception 'payment not found' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'payment_id', p_payment_id,
    'receipt_issued', p_receipt_issued,
    'receipt_confirmed_at', v_confirmed_at
  );
end;
$$;

revoke all on function public.update_payment_receipt_v1(uuid, boolean) from public;
revoke execute on function public.update_payment_receipt_v1(uuid, boolean) from anon;
grant execute on function public.update_payment_receipt_v1(uuid, boolean) to authenticated;
