ECZANE VERESİYE - MASAÜSTÜ UYGULAMASI

Çalıştırma
----------

1. Proje klasöründe PowerShell açın.
2. Paketleri kurun: `npm.cmd install`
3. Uygulamayı başlatın: `npm.cmd start`

İlk kurulum
-----------

Giriş ekranındaki "İlk kurulum: Supabase bağlantısı" bölümüne Supabase panelinden
alınan Project URL ve Publishable Key bilgilerini girip kaydedin. Service role key
kullanmayın.

Şifre kurtarma yönlendirmesi
---------------------------

Supabase panelinde Authentication > URL Configuration > Redirect URLs bölümüne
şu adresi ekleyin:

`eczane-veresiye://auth-recovery`

Veri akışı
----------

- Yeni veresiye oluşturma `create_credit_transaction_v1` RPC'sini kullanır.
- Yeni tahsilat oluşturma `record_payment_v1` RPC'sini kullanır.
- Eski yerel kayıtlar login/startup sırasında güvenli RPC akışlarına taşınır.
- Ürün eşleşmesi belirsiz eski tahsilatlar aktarılmaz ve sonraki girişte yeniden denenir.

Notlar
------

- SMS doğrulaması şu anda demo kodu üretir; gerçek SMS sağlayıcısı bağlı değildir.
- Şifre kurtarma e-postası Supabase'in e-posta gönderim limitlerine tabidir.
