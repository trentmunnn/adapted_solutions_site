const VALID_SERVICE_INTERESTS = ['operations-ai', 'digital-visibility', 'general'];

function getAllowedOrigins(env) {
    return (env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean);
}

function getCorsHeaders(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = getAllowedOrigins(env);
    const isAllowed = allowed.includes(origin) || origin.startsWith('http://localhost');
    return {
        'Access-Control-Allow-Origin': isAllowed ? origin : allowed[0] || '',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
}

function jsonResponse(data, status, corsHeaders) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}

function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function verifyTurnstile(token, secretKey, ip) {
    const form = new URLSearchParams();
    form.append('secret', secretKey);
    form.append('response', token);
    if (ip) form.append('remoteip', ip);

    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        body: form,
    });
    const data = await res.json();
    return data.success === true;
}

async function handleContact(request, env, cors) {
    let body;
    try { body = await request.json(); } catch {
        return jsonResponse({ success: false, error: 'Invalid request body' }, 400, cors);
    }

    // Honeypot — return fake success to fool bots
    if (body.honeypot) {
        return jsonResponse({ success: true, message: 'Your message has been received.' }, 200, cors);
    }

    const name = escapeHtml((body.name || '').trim().slice(0, 200));
    const email = (body.email || '').trim().slice(0, 200);
    const phone = escapeHtml((body.phone || '').trim().slice(0, 30));
    const serviceInterest = (body.serviceInterest || '').trim();
    const message = escapeHtml((body.message || '').trim().slice(0, 5000));
    const turnstileToken = (body.turnstileToken || '').trim();

    // Validate required fields
    if (!name) return jsonResponse({ success: false, error: 'Name is required' }, 400, cors);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return jsonResponse({ success: false, error: 'A valid email is required' }, 400, cors);
    }
    if (!VALID_SERVICE_INTERESTS.includes(serviceInterest)) {
        return jsonResponse({ success: false, error: 'Please select a service interest' }, 400, cors);
    }
    if (!message) return jsonResponse({ success: false, error: 'Message is required' }, 400, cors);
    if (!turnstileToken) return jsonResponse({ success: false, error: 'Please complete the verification' }, 400, cors);

    // Verify Turnstile
    const ip = request.headers.get('CF-Connecting-IP');
    const turnstileValid = await verifyTurnstile(turnstileToken, env.TURNSTILE_SECRET_KEY, ip);
    if (!turnstileValid) {
        return jsonResponse({ success: false, error: 'Verification failed — please try again' }, 403, cors);
    }

    // Rate limit: max 3 submissions per email in last 10 minutes
    try {
        const { results } = await env.DB.prepare(
            `SELECT COUNT(*) as cnt FROM contact_submissions WHERE email = ? AND submitted_at > datetime('now', '-10 minutes')`
        ).bind(email).all();
        if (results[0]?.cnt >= 3) {
            return jsonResponse({ success: false, error: 'Too many submissions. Please try again later.' }, 429, cors);
        }
    } catch (e) {
        console.error('Rate limit check error:', e);
    }

    // Insert into D1
    try {
        await env.DB.prepare(
            `INSERT INTO contact_submissions (name, email, phone, service_interest, message) VALUES (?, ?, ?, ?, ?)`
        ).bind(name, email, phone || null, serviceInterest, message).run();
    } catch (e) {
        console.error('D1 insert error:', e);
        return jsonResponse({ success: false, error: 'Something went wrong. Please try again or email us directly at info@adaptedsolutionsco.com.' }, 500, cors);
    }

    return jsonResponse({ success: true, message: "Your message has been received. We'll get back to you shortly." }, 200, cors);
}

async function handleAdminSubmissions(request, env, cors) {
    const authHeader = request.headers.get('Authorization') || '';
    if (authHeader !== `Bearer ${env.ADMIN_TOKEN}`) {
        return jsonResponse({ error: 'Unauthorized' }, 401, cors);
    }
    const { results } = await env.DB.prepare(
        'SELECT * FROM contact_submissions ORDER BY submitted_at DESC LIMIT 100'
    ).all();
    return jsonResponse({ submissions: results }, 200, cors);
}

export default {
    async fetch(request, env) {
        const cors = getCorsHeaders(request, env);

        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: cors });
        }

        const url = new URL(request.url);

        if (request.method === 'GET' && url.pathname === '/api/contact/submissions') {
            return handleAdminSubmissions(request, env, cors);
        }

        if (request.method === 'POST') {
            return handleContact(request, env, cors);
        }

        return jsonResponse({ success: false, error: 'Not found' }, 404, cors);
    },
};
