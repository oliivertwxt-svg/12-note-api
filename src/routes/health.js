import { Router } from "express";
import { sql } from "../db.js";

const router = Router();

router.get("/", async (req, res) => {
  await sql`SELECT 1`;
  res.json({ status: "ok", db: "ok" });
});

export default router;
