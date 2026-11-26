require("dotenv").config();
const { runBackup } = require("../utils/backup");

runBackup()
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.success ? 0 : 1);
  })
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
