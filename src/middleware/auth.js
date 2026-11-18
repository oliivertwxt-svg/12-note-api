import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config.js";

function unauthorized(res) {
  res.set("WWW-Authenticate", 'Bearer realm="api", error="invalid_token"');
  return res.status(401).json({
    error: { message: "Authentication required" },
  });
}

export function requireAuth(req, res, next) {
  const authorization = req.get("authorization") || "";
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization);
  if (!match) {
    unauthorized(res);
    return;
  }

  let payload;
  try {
    payload = jwt.verify(match[1], JWT_SECRET, {
      algorithms: ["HS256"],
    });
  } catch {
    unauthorized(res);
    return;
  }

  if (
    typeof payload !== "object" ||
    payload === null ||
    typeof payload.sub !== "string"
  ) {
    unauthorized(res);
    return;
  }

  req.user = { id: payload.sub };
  next();
}
