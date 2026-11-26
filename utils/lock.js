const queues = new Map();

/**
 * Serializes critical sections per key (e.g. one room/booking at a time).
 * Prevents double-booking races between overlapping requests in one process.
 */
const withLock = async (key, fn) => {
  const previous = queues.get(String(key)) || Promise.resolve();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const chain = previous.then(() => gate);
  queues.set(String(key), chain);
  await previous;
  try {
    return await fn();
  } finally {
    release();
    if (queues.get(String(key)) === chain) queues.delete(String(key));
  }
};

module.exports = { withLock };
