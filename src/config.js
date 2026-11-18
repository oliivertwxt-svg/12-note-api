function required(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

const databaseUrl = required("DATABASE_URL");
try {
  const parsedDatabaseUrl = new URL(databaseUrl);
  if (
    parsedDatabaseUrl.protocol !== "postgres:" &&
    parsedDatabaseUrl.protocol !== "postgresql:"
  ) {
    throw new Error();
  }
} catch {
  throw new Error(
    "Invalid environment variable DATABASE_URL: expected a PostgreSQL connection URL",
  );
}

const jwtSecret = required("JWT_SECRET");
if (jwtSecret.length < 32) {
  throw new Error("Invalid environment variable JWT_SECRET: must be at least 32 characters");
}

const portValue = process.env.PORT?.trim() || "3000";
const port = Number(portValue);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("Invalid environment variable PORT: expected an integer from 1 to 65535");
}

export const DATABASE_URL = databaseUrl;
export const JWT_SECRET = jwtSecret;
export const PORT = port;
