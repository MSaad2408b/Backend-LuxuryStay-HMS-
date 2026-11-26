const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");

const walk = (directory) =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.name === "node_modules" || entry.name === "backups" || entry.name === ".git") return [];
    if (entry.isDirectory()) return walk(full);
    return entry.name.endsWith(".js") ? [full] : [];
  });

const files = walk(root);
const failures = [];

files.forEach((file) => {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8", windowsHide: true });
  if (result.status !== 0) failures.push({ file, output: result.stderr || result.stdout });
});

if (failures.length) {
  failures.forEach(({ file, output }) => {
    console.error(`FAIL ${path.relative(root, file)}\n${output}`);
  });
  console.error(`${failures.length} of ${files.length} files failed syntax check`);
  process.exit(1);
}

console.log(`Syntax OK: ${files.length} JavaScript files`);
