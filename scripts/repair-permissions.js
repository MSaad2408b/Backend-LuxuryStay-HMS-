/**
 * One-off maintenance: realign stored `permissions` with the user's role.
 *
 * Accounts whose role was changed outside the API (hand-seeded demo data,
 * direct Mongo updates, records created before role-derived permissions
 * existed) can keep the previous role's permission list. The API now derives
 * permissions from the role at request time, so nothing is broken, but the
 * stored arrays should still match to keep the data honest.
 *
 * Usage:
 *   node scripts/repair-permissions.js --dry-run
 *   node scripts/repair-permissions.js
 */
require("dotenv").config({ quiet: true });

const mongoose = require("mongoose");
const config = require("../config/env");
const User = require("../models/UserSchema");
const { permissionsForRole } = require("../config/permissions");

const dryRun = process.argv.includes("--dry-run");

const samePermissions = (left = [], right = []) => {
  const a = [...new Set(left)].sort();
  const b = [...new Set(right)].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
};

(async () => {
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 5000 });

  const users = await User.find().select("email role permissions permissionsCustomized");
  let repaired = 0;

  for (const user of users) {
    if (user.permissionsCustomized) {
      console.log(`skip  ${user.email} (custom permissions)`);
      continue;
    }

    const expected = permissionsForRole(user.role);
    if (samePermissions(user.permissions, expected)) continue;

    console.log(
      `${dryRun ? "would fix" : "fix  "} ${user.email} [${user.role}] ${user.permissions.length} -> ${expected.length} permissions`
    );
    if (!dryRun) {
      await User.updateOne({ _id: user._id }, { $set: { permissions: expected } });
    }
    repaired += 1;
  }

  console.log(
    `\n${dryRun ? "Dry run" : "Repair"} complete: ${repaired} account(s) ${dryRun ? "need" : "were"} realigned, ${users.length} scanned.`
  );
  await mongoose.disconnect();
  process.exit(0);
})().catch(async (error) => {
  console.error("repair-permissions failed:", error.message);
  try {
    await mongoose.disconnect();
  } catch (_) {
    /* ignore */
  }
  process.exit(1);
});
