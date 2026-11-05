# Doğum Günü Davetiyesi: Kurulum ve Yayınlama

Site düz HTML + JavaScript'tir; derleme adımı yoktur. Firebase'i CDN üzerinden (`gstatic.com`) yükler, bu yüzden `npm install firebase` gerekmez. Firebase yalnızca veri deposu olarak kullanılır; Firebase Authentication kullanılmaz.

## Dosyalar

| Dosya | Ne işe yarar |
|---|---|
| `index.html` | Sayfanın görünümü |
| `app.js` | Veritabanı bağlantısı, LCV formu, yönetim paneli, fotoğraf yükleme |
| `firebase-config.js` | Firebase ayarları |
| `database.rules.json` | Veritabanı kuralları (Firebase konsoluna yapıştırılacak) |

## 1. Firebase ayarı (bir kez)

1. https://console.firebase.google.com → **dogumgunuuygulamasi** → **Build → Realtime Database → Rules**.
2. İçindekileri sil, `database.rules.json` dosyasının tamamını yapıştır, **Publish**'e bas.

Bu kurallar herkesin okuyup yazmasına izin verir; yalnızca verinin biçimini kontrol eder (isim uzunluğu, fotoğraf boyutu vb.). Test modu 30 gün sonra kapandığı için bu adım gereklidir.

## 2. Yönetici şifresi

Sağ üstteki **Yönetici Girişi**'nden **2908** ile girilir. Şifre tarayıcıda kontrol edilir, Firebase'de tutulmaz. Şifreyi değiştirmek için `app.js` içindeki `PW_HASH` değerini yeni şifrenin SHA-256 özetiyle değiştir.

Not: Şifre yalnızca paneli gizler. Veritabanı herkese açık olduğu için teknik bilgisi olan biri sayfanın kodundaki adres üzerinden veriyi doğrudan değiştirebilir. Küçük, özel bir davet için genelde sorun olmaz.

## 3. Bilgisayarda deneme (isteğe bağlı)

`index.html` dosyasına çift tıklamak çalışmaz (tarayıcılar `file://` adresinden modül yüklemez). Node.js kuruluysa klasörde şunu çalıştır ve http://localhost:3000 adresini aç:

```bash
npx serve .
```

## 4. Vercel ile yayınlama

### Yol A: GitHub üzerinden (hiçbir şey kurmadan)
1. https://github.com adresinde **New repository** ile yeni bir depo oluştur (ör. `dogum-gunu`).
2. Depo sayfasında **uploading an existing file** bağlantısına tıkla; `index.html`, `app.js`, `firebase-config.js` ve `database.rules.json` dosyalarını sürükle, **Commit changes**'e bas.
3. https://vercel.com adresine **Continue with GitHub** ile giriş yap.
4. **Add New… → Project** → `dogum-gunu` deposunun yanında **Import**.
5. **Framework Preset:** `Other`; **Build Command** ve **Output Directory** boş.
6. **Deploy**'a bas. `https://dogum-gunu-xxxx.vercel.app` gibi bir adres alırsın.

Sonraki değişikliklerde dosyayı GitHub'da güncellemen yeterli; Vercel otomatik yeniden yayınlar.

### Yol B: Vercel CLI (Node.js gerekir)
```bash
npm install -g vercel
```
```bash
vercel --prod
```
Komutları bu klasörün içinde çalıştır; sorulara varsayılan yanıtları verebilirsin.

## Fotoğraflar hakkında

Firebase Storage ücretli plan istediği için fotoğraflar tarayıcıda küçültülüp (en fazla ~1600 piksel, JPEG) doğrudan Realtime Database'e kaydedilir. En fazla 12 fotoğraf eklenebilir. iPhone'daki HEIC fotoğraflar bazı tarayıcılarda açılmayabilir; böyle olursa JPG olarak kaydedip tekrar dene.

## Misafir yanıtları

Her misafire tarayıcısında saklanan rastgele bir kimlik verilir. Aynı telefondan/tarayıcıdan tekrar girince kendi yanıtını görüp değiştirebilir. Farklı bir cihazdan girerse yeni bir yanıt oluşur; fazlalıkları yönetim panelinden silebilirsin.
