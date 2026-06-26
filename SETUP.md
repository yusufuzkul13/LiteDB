# LiteDB SQL Visualizer — Kurulum Rehberi

SQL şema görselleştirici ve diyagram editörü.
DB bağlantı bilgileri **şifreli** olarak `LiteDB/data/` klasöründe tutulur — git'e gitmez.

---

## Gereksinimler

- Node.js >= 18, npm >= 9
- Microsoft SQL Server erişimi

---

## 1. Şifreleme Anahtarı

```bash
# LiteDB klasöründe:
cp .env.sample .env
```

`.env` dosyasını açıp `LITEDB_SECRET` değerini **güçlü 32 karakterlik** bir anahtar ile doldurun:

```
LITEDB_SECRET=your-unique-32-char-secret-key!!
```

Anahtar üretmek için:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex').substring(0,32))"
```

---

## 2. Kurulum ve Başlatma

```bash
cd LiteDB
npm install
npm run dev
# → http://localhost:5173
```

---

## 3. İlk Diyagram

1. **"Yeni Diyagram"** → Bağlantı bilgilerini gir
2. **"Bağlantıyı Test Et"** ile doğrula
3. **"Oluştur"** → Şema otomatik çekilir

Bağlantı bilgileri `data/connections/` klasöründe **AES-256 ile şifreli** saklanır.

---

## 4. Senkronizasyon

Header'daki **🔄 Senkronize Et** butonu ile canlı DB'den değişiklikler çekilir.
`sql/projects/default/tables/` klasörü otomatik güncellenir.

---

## Klasör Yapısı

```
LiteDB/
├── data/              ← GİZLİ (gitignore ❌)
│   ├── connections/   ← Şifreli bağlantılar
│   └── diagrams/      ← Diyagram kayıtları
├── .env               ← Şifreleme anahtarı (gitignore ❌)
├── .env.sample        ← Şablon (git'e gider ✅)
└── SETUP.md           ← Bu dosya (git'e gider ✅)
```
