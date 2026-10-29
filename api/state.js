const {
  STATE_KEY,
  emptyState,
  getRedis,
  isOrganizer,
  parseRecord,
  publicState,
  readBody,
  validState
} = require('../lib/shared');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const redis = getRedis();
    const organizer = isOrganizer(req);
    const record = parseRecord(await redis.get(STATE_KEY));

    if (req.method === 'GET') {
      return res.status(200).json({
        state: publicState(record?.state || emptyState(), organizer),
        version: record?.version || 0,
        initialized: Boolean(record),
        isOrganizer: organizer
      });
    }

    const body = readBody(req);
    if (!body || !validState(body.state) || !Number.isSafeInteger(body.version) || body.version < 0) {
      return res.status(400).json({ error: 'Invalid booking data. Refresh the page and try again.' });
    }

    const currentState = record?.state || emptyState();
    const nextState = {
      event: body.state.event,
      next: Math.max(body.state.next, currentState.next),
      seats: { ...body.state.seats }
    };

    if (!organizer) {
      for (const [key, seat] of Object.entries(nextState.seats)) {
        delete seat.phone;
        const previousSeat = currentState.seats[key];
        const savedPhone = previousSeat?.name === seat.name ? previousSeat.phone : '';
        if (savedPhone) seat.phone = savedPhone;
      }
    }

    const nextRecord = { state: nextState, version: body.version + 1 };
    const result = await redis.eval(
      `local current = redis.call("GET", KEYS[1])
       local currentVersion = 0
       if current then currentVersion = cjson.decode(current).version end
       if currentVersion ~= tonumber(ARGV[1]) then return -1 end
       redis.call("SET", KEYS[1], ARGV[2])
       return currentVersion + 1`,
      [STATE_KEY],
      [String(body.version), JSON.stringify(nextRecord)]
    );

    if (Number(result) === -1) {
      const latest = parseRecord(await redis.get(STATE_KEY));
      return res.status(409).json({
        error: 'Another person updated the bookings. The latest shared data has been loaded; please reapply your change.',
        state: publicState(latest?.state || emptyState(), organizer),
        version: latest?.version || 0,
        initialized: Boolean(latest),
        isOrganizer: organizer
      });
    }

    return res.status(200).json({ version: Number(result), isOrganizer: organizer });
  } catch (error) {
    console.error('Shared seating state request failed:', error);
    return res.status(503).json({ error: error.message || 'Shared storage is unavailable.' });
  }
};
