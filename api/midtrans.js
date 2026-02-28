const crypto = require('crypto');
const https = require('https');
const http = require('http');

// Simple forward helper (no fetch dependency)
function forwardRequest(url, body, timeout = 8000) {
    return new Promise((resolve) => {
        try {
            const parsed = new URL(url);
            const lib = parsed.protocol === 'https:' ? https : http;
            const data = JSON.stringify(body);

            const req = lib.request({
                hostname: parsed.hostname,
                port: parsed.port,
                path: parsed.pathname + parsed.search,
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
                timeout
            }, (res) => {
                resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode });
            });

            req.on('error', () => resolve({ ok: false, status: 0 }));
            req.on('timeout', () => { req.destroy(); resolve({ ok: false, status: 0 }); });
            req.write(data);
            req.end();
        } catch (e) { resolve({ ok: false, status: 0 }); }
    });
}

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // === GET: Health check ===
    if (req.method === 'GET') {
        return res.status(200).json({
            status: 'OK',
            service: 'Midtrans QRIS Webhook',
            merchant: process.env.MIDTRANS_MERCHANT_ID || 'not-set',
            time: new Date().toISOString()
        });
    }

    // === POST: Midtrans notification ===
    if (req.method === 'POST') {
        try {
            const n = req.body || {};
            if (!n.order_id) return res.status(400).json({ error: 'Missing order_id' });

            const serverKey = process.env.MIDTRANS_SERVER_KEY;
            if (!serverKey) return res.status(500).json({ error: 'MIDTRANS_SERVER_KEY not set' });

            // Verify signature
            if (!n.signature_key) return res.status(403).json({ error: 'No signature' });

            const expected = crypto.createHash('sha512')
                .update(n.order_id + n.status_code + n.gross_amount + serverKey)
                .digest('hex');

            if (expected !== n.signature_key) return res.status(403).json({ error: 'Bad signature' });

            console.log(`[OK] ${n.order_id} | ${n.transaction_status} | Rp${n.gross_amount}`);

            // Forward to bot (optional)
            let forwarded = false;
            if (process.env.BOT_CALLBACK_URL) {
                const fwd = await forwardRequest(process.env.BOT_CALLBACK_URL, n);
                forwarded = fwd.ok;
                console.log(`[FWD] ${fwd.status} ${forwarded ? 'OK' : 'FAIL'}`);
            }

            return res.status(200).json({
                success: true,
                order_id: n.order_id,
                status: n.transaction_status,
                forwarded
            });
        } catch (err) {
            console.error('[ERR]', err.message);
            return res.status(500).json({ error: 'Server error' });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
};
