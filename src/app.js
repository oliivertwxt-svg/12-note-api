import cors from "cors";
import express from "express";
import helmet from "helmet";
import authRouter from "./routes/auth.js";
import healthRouter from "./routes/health.js";

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: ["http://localhost:5173", "http://localhost:3000"],
  }),
);
app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on("finish", () => {
    console.info(
      `${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - startedAt}ms`,
    );
  });
  next();
});
app.use(express.json({ limit: "100kb" }));

app.use("/api/auth", authRouter);
app.use("/api/health", healthRouter);

app.use((req, res) => {
  res.status(404).json({ error: { message: "Not found" } });
});

app.use((err, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  const status = Number.isInteger(err.status)
    ? err.status
    : Number.isInteger(err.statusCode)
      ? err.statusCode
      : 500;
  const isProduction = process.env.NODE_ENV === "production";
  const isInvalidJson = status === 400 && err.type === "entity.parse.failed";
  const message = isInvalidJson
    ? "Invalid JSON"
    : isProduction
      ? "Request failed"
      : status >= 500
        ? "Internal server error"
        : err.message || "Request failed";
  const error = { message };

  if (!isProduction && status < 500 && err.details !== undefined) {
    error.details = err.details;
  }

  if (!isProduction && status >= 500) {
    console.error(err);
  }

  res.status(status).json({ error });
});

export default app;
