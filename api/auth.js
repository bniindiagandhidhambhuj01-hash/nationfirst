const crypto = require('node:crypto');
const { COOKIE_NAME, getRedis, isOrganizer, readBody, sessionSecret, setOrganizerCookie } = require('../lib/shared');

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      return res.status(200).json({ isOrganizer: isOrganizer(req) });
    } catch (error) {
      return res.status(503).json({ error: error.message });
    }
  }

  if (req.method === 'DELETE') {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure}`);
    return res.status(200).json({ isOrganizer: false });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const configuredPin = process.env.ORGANIZER_PIN;
  if (!configuredPin) {
    return res.status(503).json({ error: 'Organizer access is not configured. Set ORGANIZER_PIN in the deployment environment.' });
  }

  try {
    sessionSecret();
  } catch (error) {
    return res.status(503).json({ error: 'Organizer access is not configured. Set ORGANIZER_SESSION_SECRET to at least 32 characters.' });
  }

  const body = readBody(req);
  if (!body || typeof body.pin !== 'string' || body.pin.length > 128) {
    return res.status(400).json({ error: 'Enter the organizer PIN.' });
  }
  try {
    const redis = getRedis();
    const ip = req.headers['x-real-ip'] || req.socket.remoteAddress || 'unknown';
    const rateKey = `nationfirst:organizer-attempts:${crypto.createHash('sha256').update(ip).digest('hex')}`;
    if (Number(await redis.get(rateKey) || 0) >= 10) {
      return res.status(429).json({ error: 'Too many organizer sign-in attempts. Try again in 15 minutes.' });
    }

    const submitted = Buffer.from(body.pin);
    const expected = Buffer.from(configuredPin);
    if (submitted.length !== expected.length || !crypto.timingSafeEqual(submitted, expected)) {
      const attempts = await redis.incr(rateKey);
      if (attempts === 1) await redis.expire(rateKey, 900);
      return res.status(401).json({ error: 'Incorrect organizer PIN.' });
    }

    await redis.del(rateKey);
    setOrganizerCookie(res);
    return res.status(200).json({ isOrganizer: true });
  } catch (error) {
    return res.status(503).json({ error: error.message });
  }
};
