const crypto = require('node:crypto');
const { Redis } = require('@upstash/redis');

const STATE_KEY = 'nationfirst:seating:v1';
const COOKIE_NAME = 'nationfirst_organizer';
const emptyState = () => ({ seats: {}, next: 1, event: 'Event Nation' });

function getRedis() {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    throw new Error('Shared storage is not configured. Add the Upstash Redis URL and token.');
  }
  return Redis.fromEnv();
}

function sessionSecret() {
  const secret = process.env.ORGANIZER_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('Organizer access is not configured. Set a session secret of at least 32 characters.');
  }
  return secret;
}

function isOrganizer(req) {
  const cookie = req.headers.cookie || '';
  const token = cookie.split(';').map(part => part.trim())
    .find(part => part.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1);
  if (!token) return false;
  const [expiresAt, signature] = token.split('.');
  if (!/^\d{10}$/.test(expiresAt) || !/^[a-f0-9]{64}$/.test(signature) || Number(expiresAt) <= Math.floor(Date.now() / 1000)) return false;
  const expected = crypto.createHmac('sha256', sessionSecret()).update(`nationfirst-organizer:${expiresAt}`).digest('hex');
  const actualBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && crypto.timingSafeEqual(actualBytes, expectedBytes);
}

function setOrganizerCookie(res) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const expiresAt = Math.floor(Date.now() / 1000) + 28800;
  const signature = crypto.createHmac('sha256', sessionSecret()).update(`nationfirst-organizer:${expiresAt}`).digest('hex');
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${expiresAt}.${signature}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secure}`);
}

function parseRecord(value) {
  if (!value) return null;
  return typeof value === 'string' ? JSON.parse(value) : value;
}

function publicState(state, organizer) {
  if (organizer) return state;
  return {
    ...state,
    seats: Object.fromEntries(Object.entries(state.seats).map(([key, seat]) => {
      const { phone, ...publicSeat } = seat;
      return [key, publicSeat];
    }))
  };
}

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try {
    return JSON.parse(req.body || '{}');
  } catch {
    return null;
  }
}

function validState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return false;
  if (typeof state.event !== 'string' || state.event.length > 120) return false;
  if (!Number.isSafeInteger(state.next) || state.next < 1) return false;
  if (!state.seats || typeof state.seats !== 'object' || Array.isArray(state.seats)) return false;
  const entries = Object.entries(state.seats);
  if (entries.length > 480) return false;
  return entries.every(([key, seat]) =>
    /^(S([1-9]|1[0-9]|2[0-4])-[12]|T([1-9]|[1-4][0-9]|5[0-6])-[1-6])$/.test(key) &&
    seat && typeof seat === 'object' && !Array.isArray(seat) &&
    typeof seat.name === 'string' && seat.name.trim().length > 0 && seat.name.length <= 120 &&
    (seat.phone === undefined || (typeof seat.phone === 'string' && seat.phone.length <= 40)) &&
    (seat.pass === null || (typeof seat.pass === 'string' && /^EN-\d{4,}$/.test(seat.pass)))
  );
}

module.exports = {
  COOKIE_NAME,
  STATE_KEY,
  emptyState,
  getRedis,
  isOrganizer,
  parseRecord,
  publicState,
  readBody,
  sessionSecret,
  setOrganizerCookie,
  validState
};
