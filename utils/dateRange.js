/**
 * Shared `from`/`to` query parsing.
 *
 * Returns the invalid field names instead of throwing so callers can decide
 * between "ignore the filter" (reports) and "reject the request" (audit logs).
 * Passing an unparseable date straight into a Mongoose filter used to raise
 * `Cast to date failed for value "Invalid Date"` and surface as a 500.
 */
const parseDateRange = (query = {}) => {
  const range = {};
  const invalid = [];

  if (query.from !== undefined && query.from !== null && query.from !== "") {
    const from = new Date(query.from);
    if (Number.isNaN(from.getTime())) invalid.push("from");
    else range.$gte = from;
  }

  if (query.to !== undefined && query.to !== null && query.to !== "") {
    const to = new Date(query.to);
    if (Number.isNaN(to.getTime())) invalid.push("to");
    else {
      to.setHours(23, 59, 59, 999);
      range.$lte = to;
    }
  }

  return {
    range: Object.keys(range).length ? range : null,
    invalid,
  };
};

module.exports = { parseDateRange };
