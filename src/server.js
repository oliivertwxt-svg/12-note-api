import app from "./app.js";
import { PORT } from "./config.js";

const server = app.listen(PORT, () => {
  console.info(`Server listening on port ${PORT}`);
});

server.on("error", (error) => {
  console.error(`Unable to start server: ${error.message}`);
  process.exitCode = 1;
});
