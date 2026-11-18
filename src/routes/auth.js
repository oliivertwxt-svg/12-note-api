import bcrypt from "bcryptjs";
import { rateLimit } from "express-rate-limit";
import { Router } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { JWT_SECRET } from "../config.js";
import { sql } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../lib/validate.js";

const router = Router();
const emailSchema = z.string().trim().email().transform((email) => email.toLowerCase());
const registerSchema = z.object({
  name: z.string().trim().min(1),
  email: emailSchema,
  password: z
    .string()
    .min(10)
    .refine((password) => /[A-Za-z]/.test(password) && /\d/.test(password), {
      message: "Password must include at least one letter and one number",
    }),
});
const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});

router.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: { message: "Too many authentication requests. Please try again later." },
    },
  }),
);

router.post("/register", validate(registerSchema), async (req, res) => {
  const { name, email, password } = req.body;
  const passwordHash = await bcrypt.hash(password, 12);

  let user;
  try {
    [user] = await sql`
      INSERT INTO users (name, email, password_hash)
      VALUES (${name}, ${email}, ${passwordHash})
      RETURNING id, name, email, created_at
    `;
  } catch (error) {
    if (error?.code === "23505") {
      res.status(409).json({ error: { message: "Email already registered" } });
      return;
    }
    throw error;
  }

  const token = jwt.sign({ sub: user.id }, JWT_SECRET, {
    expiresIn: "1h",
    algorithm: "HS256",
  });
  res.status(201).json({ user, token });
});

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(401).json({ error: { message: "Invalid email or password" } });
    return;
  }

  const { email, password } = parsed.data;
  const [record] = await sql`
    SELECT id, name, email, created_at, password_hash
    FROM users
    WHERE email = ${email}
  `;

  if (!record || !(await bcrypt.compare(password, record.password_hash))) {
    res.status(401).json({ error: { message: "Invalid email or password" } });
    return;
  }

  const { id, name, email: userEmail, created_at } = record;
  const user = { id, name, email: userEmail, created_at };
  const token = jwt.sign({ sub: user.id }, JWT_SECRET, {
    expiresIn: "1h",
    algorithm: "HS256",
  });
  res.json({ token, user });
});

router.get("/me", requireAuth, async (req, res) => {
  const [user] = await sql`
    SELECT id, name, email, created_at
    FROM users
    WHERE id = ${req.user.id}
  `;

  if (!user) {
    res.status(404).json({ error: { message: "User not found" } });
    return;
  }

  res.json({ user });
});

export default router;
