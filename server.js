const { WebSocketServer, WebSocket } = require('ws');

const PORT = Number(process.env.PORT || 8787);
const wss = new WebSocketServer({ port: PORT });
const rooms = new Map();
const latestState = new Map();
const allowedTypes = new Set(['play', 'pause', 'seek', 'rate', 'tick']);

function removeFromRoom(client) {
  if (!client.room) return;
  const members = rooms.get(client.room);
  if (members) {
    members.delete(client);
    if (members.size === 0) rooms.delete(client.room);
  }
  client.room = null;
}

wss.on('connection', (client) => {
  client.room = null;

  client.on('message', (raw) => {
    let message;
    try { message = JSON.parse(raw.toString()); } catch (_) { return; }

    if (message.type === 'join') {
      const room = typeof message.room === 'string' ? message.room.trim() : '';
      if (!/^[a-zA-Z0-9_-]{4,80}$/.test(room)) {
        client.send(JSON.stringify({ type: 'error', message: 'Invalid room code.' }));
        return;
      }
      removeFromRoom(client);
      client.room = room;
      if (!rooms.has(room)) rooms.set(room, new Set());
      rooms.get(room).add(client);

      const snapshot = latestState.get(room);
      if (snapshot) client.send(JSON.stringify({ ...snapshot, type: 'snapshot', sentAt: Date.now() }));
      return;
    }

    if (!client.room || !allowedTypes.has(message.type)) return;
    if (!Number.isFinite(message.time) || message.time < 0) return;

    const cleanState = {
      time: message.time,
      rate: Number.isFinite(message.rate) && message.rate > 0 ? Math.min(message.rate, 4) : 1,
      paused: Boolean(message.paused),
      sentAt: Date.now()
    };
    latestState.set(client.room, cleanState);

    const outgoing = JSON.stringify({
      type: message.type,
      ...cleanState
    });
    const members = rooms.get(client.room);
    if (!members) return;
    for (const peer of members) {
      if (peer !== client && peer.readyState === WebSocket.OPEN) peer.send(outgoing);
    }
  });

  client.on('close', () => removeFromRoom(client));
  client.on('error', () => removeFromRoom(client));
});

console.log(`Together Video Sync relay listening on ws://localhost:${PORT}`);
