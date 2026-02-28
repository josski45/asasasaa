const crypto = require('crypto');

/**
 * Vercel Serverless Function - Midtrans QRIS Webhook Handler
 * 
 * Endpoint: POST /api/midtrans
 * 
 * Flow:
 * 1. Midtrans sends payment notification to this URL
 * 2. Verify SHA512 signature
 * 3. Return 200 (acknowledge receipt)
 * 4. Optionally forward to bot's local webhook (via BOT_CALLBACK_URL)
 * 
 * Bot tetap punya polling sendiri ke Midtrans API sebagai backup,
 * jadi payment tetap terdeteksi meskipun forward gagal.
 */
module.exports = async (req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // GET - Health check
    if (req.method === 'GET') {
        return res.status(200).json({
            status: 'OK',
            service: 'Midtrans QRIS Webhook (Vercel)',
            merchant: process.env.MIDTRANS_MERCHANT_ID || 'not-configured',
            timestamp: new Date().toISOString()
        });
    }

    // POST - Midtrans notification handler
    if (req.method === 'POST') {
        try {
            const notification = req.body;

            if (!notification || !notification.order_id) {
                return res.status(400).json({ error: 'Invalid notification payload' });
            }

            const serverKey = process.env.MIDTRANS_SERVER_KEY;
            if (!serverKey) {
                console.error('MIDTRANS_SERVER_KEY not configured');
                return res.status(500).json({ error: 'Server configuration error' });
            }

            const {
                order_id,
                status_code,
                gross_amount,
                signature_key,
                transaction_status,
                payment_type,
                transaction_id,
                transaction_time
            } = notification;

            // ========== Signature Verification ==========
            if (signature_key) {
                const payload = order_id + status_code + gross_amount + serverKey;
                const expectedSignature = crypto.createHash('sha512').update(payload).digest('hex');

                if (expectedSignature !== signature_key) {
                    console.warn(`[WEBHOOK] Invalid signature for order ${order_id}`);
                    return res.status(403).json({ error: 'Invalid signature' });
                }
            } else {
                console.warn(`[WEBHOOK] No signature_key in notification for ${order_id}`);
                return res.status(403).json({ error: 'Missing signature' });
            }

            // ========== Log notification ==========
            console.log(`[WEBHOOK] Order: ${order_id} | Status: ${transaction_status} | Amount: Rp${gross_amount} | Type: ${payment_type || 'qris'}`);

            // ========== Forward to bot (optional) ==========
            const callbackUrl = process.env.BOT_CALLBACK_URL;
            let forwarded = false;

            if (callbackUrl) {
                try {
                    const controller = new AbortController();
                    const timeout = setTimeout(() => controller.abort(), 8000); // 8s timeout

                    const response = await fetch(callbackUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(notification),
                        signal: controller.signal
                    });

                    clearTimeout(timeout);
                    forwarded = response.ok;
                    console.log(`[WEBHOOK] Forward to bot: ${response.status} ${forwarded ? '✓' : '✗'}`);
                } catch (forwardError) {
                    console.warn(`[WEBHOOK] Forward failed: ${forwardError.message}`);
                    // Tidak fatal - bot punya polling sendiri ke Midtrans API
                }
            }

            // ========== Response to Midtrans ==========
            return res.status(200).json({
                success: true,
                message: 'Notification received',
                order_id,
                transaction_status,
                forwarded
            });
        } catch (error) {
            console.error('[WEBHOOK] Error:', error.message);
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
};
