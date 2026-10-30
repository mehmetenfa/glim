# Glim

Okurken gözü ekrana kaydırmayan sakin bir ekran koruyucu. Kısayolla açarsın, tüm ekranları koyu bir zeminle kaplar; saat ya da göz yormayan yumuşak bir animasyon gösterir. Tıklayınca kapanır.

*A calm, eye-friendly screensaver you toggle on while reading. It covers every display with a dark warm-toned scene (clock or a soft animation). Click to dismiss.*

## Kurulum

[Releases](https://github.com/mehmetenfa/glim/releases/latest) sayfasından kendi sistemine uygun paketi indir:

- **macOS:** `Glim-*-mac-arm64.dmg` (Apple Silicon: M1/M2/M3...) veya `Glim-*-mac-x64.dmg` (Intel)
- **Windows:** `Glim-*-win-x64.exe`

Her yeni sürümde paketler otomatik olarak güncellenir ve bu sayfaya eklenir.

### macOS ilk açılış uyarısı

Uygulama Apple'a imzalı değil. İlk açılışta "hasarlı" veya "doğrulanamadı" uyarısı çıkarsa Terminal'de şunu çalıştır:

```
xattr -cr /Applications/Glim.app
```

Sonra uygulamayı normal şekilde aç.

### Windows ilk açılış uyarısı

SmartScreen "Windows bilgisayarınızı korudu" derse **Ek bilgi → Yine de çalıştır**'a tıkla.

## Kullanım

Glim menü çubuğunda (macOS) veya sistem tepsisinde (Windows) çalışır ve girişte otomatik açılır.

| Tuş | İşlev |
| --- | --- |
| `Cmd/Ctrl + Shift + R` | Okuma modunu aç / kapat |
| `1`–`5` | Mod seç: saat, nefes, aurora, ateş böcekleri, yağmur |
| `C` | Animasyonun üstünde saati aç / kapat |
| `↑` / `↓` | Parlaklık |
| `Esc` veya tıklama | Kapat |

Bilgisayar 15 dakika kullanılmazsa okuma modu kendiliğinden açılır (menüden 5/10/30 dakikaya ya da kapalıya alınabilir). Renkler sıcak ve düşük kontrastlıdır, mavi ışık kullanılmaz. Birden fazla monitörde hepsini birlikte kaplar.

## Geliştirme

```
npm install
npm start          # çalıştır
npm run dist       # kendi sistemin için paket üret (release/ klasörü)
```

### Yeni sürüm yayınlama

```
npm version patch   # ya da minor / major
git push --follow-tags
```

`v*` etiketi gönderilince GitHub Actions macOS ve Windows paketlerini derler ve tek bir sürüm olarak Releases sayfasına yükler.

## Lisans

MIT
