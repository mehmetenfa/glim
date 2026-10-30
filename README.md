# Glim

Okurken gözü ekrana kaydırmayan sakin bir ekran koruyucu. Kısayolla "perdeyi çekersin": tüm ekranları koyu bir zeminle kaplar; saat ya da göz yormayan yumuşak bir animasyon gösterir. Tıklayınca perde kalkar. Okurken de, ekran koruyucu olarak da kullanılır.

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
| `Cmd/Ctrl + Option/Alt + Shift + G` | Perdeyi çek / kaldır |
| `1`–`9` | Mod seç: saat, nefes, aurora, ateş böcekleri, yağmur, küre, yıldızlar, dalgalar, közler |
| `C` | Animasyonun üstünde saati aç / kapat |
| `↑` / `↓` | Parlaklık |
| `Esc` veya tıklama | Perdeyi kaldır |

- Bilgisayar 15 dakika kullanılmazsa perde kendiliğinden çekilir (menüden 5/10/30 dakikaya ya da kapalıya alınabilir).
- Perde çekildikten sonra ekran kilitlenebilir: anında, 1/2/5/10/15/30 dakika sonra ya da hiç (varsayılan 5 dakika). Kilit türü menüden seçilir:
  - **macOS kilit ekranı:** Sistemin kendi kilidi. Perde kalkar, kilit ekranı gelir (perde kilit ekranında oynayamaz).
  - **Perde kilidi (yalnızca macOS):** Perde oynamaya devam eder; kaldırmak için Touch ID ya da Mac şifresi gerekir. Dock, menü çubuğu, uygulama değiştirme ve zorla kapatma perde kilitliyken engellenir. Bu gerçek bir sistem kilidi değildir: evdeki meraklara karşı yeterlidir, bilgisayarı ele geçirmek isteyen biri için yeterli değildir. Touch ID penceresi açıkken Dock ve menü çubuğu kısa süre görünür.
- Perde çekiliyken bilgisayar uykuya geçmez (menüden kapatılabilir).

Renkler sıcak ve düşük kontrastlıdır, mavi ışık kullanılmaz. Birden fazla monitörde hepsini birlikte kaplar.

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
