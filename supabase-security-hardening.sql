-- Eczane Veresiye — Supabase sunucu sertleştirme
-- Çalıştırmadan önce yedek alın ve önce staging/test projesinde deneyin.
-- Bu SQL, finansal yazmaları RPC'lere bırakır. Uygulama sahibi incelemeden canlıda çalıştırmayın.

begin;

-- 0) QR kodlarda mevcut tekrar varsa güvenli biçimde dur.
do $$
begin
  if exists (
    select 1
    from public.transaction_items
    where nullif(btrim(qr_code), '') is not null
    group by btrim(qr_code)
    having count(*) > 1
  ) then
    raise exception 'transaction_items.qr_code içinde tekrar var; önce tekrarları temizleyin.';
  end if;
end $$;

-- 1) Aynı karekodun birden fazla işlemde kullanılmasını engelle.
create unique index if not exists transaction_items_qr_code_unique_idx
  on public.transaction_items (btrim(qr_code))
  where nullif(btrim(qr_code), '') is not null;

-- 2) RPC'lerin çalışabilmesi için imzalı fonksiyonları güvenli tanımla.
-- Fonksiyonların search_path'i zaten boş olarak tanımlanmıştır.
alter function public.create_credit_transaction_v1(jsonb) security definer;
alter function public.record_payment_v1(jsonb) security definer;
revoke all on function public.create_credit_transaction_v1(jsonb) from public;
revoke execute on function public.create_credit_transaction_v1(jsonb) from anon;
revoke all on function public.record_payment_v1(jsonb) from public;
revoke execute on function public.record_payment_v1(jsonb) from anon;
grant execute on function public.create_credit_transaction_v1(jsonb) to authenticated;
grant execute on function public.record_payment_v1(jsonb) to authenticated;

-- 3) Finansal tablolardaki doğrudan INSERT/DELETE izinlerini kaldır.
-- Yeni veresiye ve tahsilat yalnızca RPC üzerinden yazılmalıdır.
drop policy if exists "Personel veresiye ekleyebilir" on public.credit_transactions;
drop policy if exists "Personel veresiye silebilir" on public.credit_transactions;
drop policy if exists "Personel urun ekleyebilir" on public.transaction_items;
drop policy if exists "Personel urun silebilir" on public.transaction_items;
drop policy if exists "Personel tahsilat ekleyebilir" on public.payments;
drop policy if exists "Personel tahsilat silebilir" on public.payments;
drop policy if exists "Personel tahsilat urunu ekleyebilir" on public.payment_items;
drop policy if exists "Personel tahsilat urunu silebilir" on public.payment_items;

revoke insert, delete on public.credit_transactions from authenticated;
revoke insert, delete on public.transaction_items from authenticated;
revoke insert, delete on public.payments from authenticated;
revoke insert, delete on public.payment_items from authenticated;

-- 4) Tahsilat ve ürün satırlarının doğrudan güncellenmesini kapat.
-- Veresiye güncellemesinde yalnızca otomatik tahsilat ayarları uygulama tarafından
-- doğrudan güncelleniyor; finansal alanlar RPC dışında değiştirilemez.
drop policy if exists "Personel veresiye guncelleyebilir" on public.credit_transactions;
revoke update on public.credit_transactions from authenticated;
grant update (
  auto_charge_enabled,
  auto_charge_days,
  auto_charge_status,
  auto_charge_last_error,
  auto_charge_next_retry,
  updated_at
) on public.credit_transactions to authenticated;

create policy "Personel otomatik tahsilat ayarini guncelleyebilir"
on public.credit_transactions
for update to authenticated
using (public.is_pharmacy_user())
with check (public.is_pharmacy_user());

drop policy if exists "Personel urun guncelleyebilir" on public.transaction_items;
drop policy if exists "Personel tahsilat guncelleyebilir" on public.payments;
drop policy if exists "Personel tahsilat urunu guncelleyebilir" on public.payment_items;
revoke update on public.transaction_items from authenticated;
revoke update on public.payments from authenticated;
revoke update on public.payment_items from authenticated;

commit;

-- Bilinçli olarak otomatik değiştirilmeyen noktalar:
-- * RPC içindeki operator_name istemciden geliyor; gerçek personel adı auth.uid()
--   üzerinden ayrıca RPC gövdesinde belirlenmelidir.
-- * RLS rollerinin müşteri/personel ayrımı pg_policies çıktısıyla tekrar test edilmelidir.
-- * Bu dosya Supabase Auth'taki "yeni kullanıcı kaydı" ayarını değiştirmez.
