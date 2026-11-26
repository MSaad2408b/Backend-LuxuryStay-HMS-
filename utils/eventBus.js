const { EventEmitter } = require("events");

const emitter = new EventEmitter();
emitter.setMaxListeners(0);

const subscribe = (req, res) => {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
  res.write("retry: 3000\n\n");

  const onEvent = (payload) => {
    res.write(`event: ${payload.event}\ndata: ${JSON.stringify(payload.data)}\n\n`);
  };

  emitter.on("broadcast", onEvent);
  const heartbeat = setInterval(() => res.write(": ping\n\n"), 25000);

  const cleanup = () => {
    clearInterval(heartbeat);
    emitter.off("broadcast", onEvent);
  };
  req.on("close", cleanup);
  res.on("close", cleanup);
};

const broadcast = (event, data) => {
  emitter.emit("broadcast", { event, data: { ...data, at: new Date().toISOString() } });
};

const broadcastRoomStatus = (roomId, status, extra = {}) =>
  broadcast("room:status", { roomId: String(roomId), status, ...extra });

module.exports = { subscribe, broadcast, broadcastRoomStatus, emitter };
