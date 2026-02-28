# Midtrans QRIS Webhook - Vercel Deployment

Webhook handler untuk menerima notifikasi pembayaran dari Midtrans, di-deploy sebagai Vercel Serverless Function.

## Kenapa Vercel?

Bot WhatsApp/Telegram jalan di lokal (gak punya public URL), tapi Midtrans butuh webhook URL yang bisa diakses dari internet. Vercel serverless function gratis dan selalu online.

## Flow

```
User bayar QRIS → Midtrans proses → POST notifikasi ke Vercel
                                          ↓
                                   Verify signature
                                          ↓
                              Return 200 (acknowledge)
                                          ↓
                        [Opsional] Forward ke bot callback URL
```

> **Note:** Bot sudah punya polling sendiri ke Midtrans API (cek setiap 5-15 detik), jadi payment TETAP terdeteksi meskipun webhook forward gagal. Webhook hanya untuk konfirmasi lebih cepat.

## Deploy ke Vercel

### 1. Install Vercel CLI

```bash
npm i -g vercel
```

### 2. Login & Deploy

```bash
cd vercel-webhook
vercel login
vercel --prod
```

### 3. Set Environment Variables

Di **Vercel Dashboard** → Project Settings → Environment Variables, tambahkan:

| Variable | Value | Required |
|----------|-------|----------|
| `MIDTRANS_SERVER_KEY` | `Mid-server-87SkA543LEfM0d6sxL2n8rV3` | ✅ Wajib |
| `MIDTRANS_MERCHANT_ID` | `G043527696` | Opsional |
| `BOT_CALLBACK_URL` | `https://your-bot-url/webhook/midtrans` | Opsional |

> **BOT_CALLBACK_URL:** Set ini kalau bot punya public URL (misal pakai ngrok: `https://abc123.ngrok.io/webhook/midtrans`). Kalau tidak di-set, bot tetap deteksi payment via polling.

### 4. Set Webhook URL di Midtrans Dashboard

1. Login ke [Midtrans Dashboard](https://dashboard.midtrans.com)
2. Settings → **Payment Notification URL**
3. Set URL:
   ```
   https://your-project.vercel.app/webhook/midtrans
   ```
   atau
   ```
   https://your-project.vercel.app/api/midtrans
   ```
   (keduanya valid, sudah di-route)

### 5. Test

Health check:
```bash
curl https://your-project.vercel.app/api/midtrans
```

Response:
```json
{
    "status": "OK",
    "service": "Midtrans QRIS Webhook (Vercel)",
    "merchant": "G043527696",
    "timestamp": "2026-02-28T..."
}
```

## Endpoints

| Method | Path | Fungsi |
|--------|------|--------|
| GET | `/api/midtrans` | Health check |
| POST | `/api/midtrans` | Terima notifikasi Midtrans |
| POST | `/webhook/midtrans` | Alias → redirect ke `/api/midtrans` |

## Monitoring

Cek logs di Vercel Dashboard → Deployments → Functions → Logs

Setiap notifikasi yang masuk akan di-log:
```
[WEBHOOK] Order: OSINTDAY-xxx | Status: settlement | Amount: Rp5000 | Type: qris
[WEBHOOK] Forward to bot: 200 ✓
```
