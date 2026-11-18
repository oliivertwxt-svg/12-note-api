import { Router } from "express";
import { z } from "zod";
import { sql } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../lib/validate.js";

const router = Router();
const noteIdParamsSchema = z.object({ id: z.uuid() });
const createNoteSchema = z.object({
  title: z.string().trim().min(1),
  body: z.string(),
  tags: z.array(z.string().trim().min(1)).default([]),
  pinned: z.boolean().default(false),
}).strict();
const updateNoteSchema = z.object({
  title: z.string().trim().min(1).optional(),
  body: z.string().optional(),
  tags: z.array(z.string().trim().min(1)).optional(),
  pinned: z.boolean().optional(),
}).strict();
const listQuerySchema = z.object({
  q: z.string().trim().optional(),
  tag: z.string().trim().optional(),
  pinned: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();

router.use(requireAuth);

router.get("/", async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(422).json({
      error: {
        message: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      },
    });
    return;
  }

  const { q, tag, pinned, page, limit } = parsed.data;
  const searchPattern = q ? `%${q}%` : null;
  const tagFilter = tag || null;
  const pinnedFilter = pinned === undefined ? null : pinned === "true";
  const offset = (page - 1) * limit;

  const [countResult] = await sql`
    SELECT count(*) AS total
    FROM notes
    WHERE TRUE
      AND user_id = ${req.user.id}
      AND (${searchPattern}::text IS NULL OR title ILIKE ${searchPattern} OR body ILIKE ${searchPattern})
      AND (${tagFilter}::text IS NULL OR ${tagFilter} = ANY(tags))
      AND (${pinnedFilter}::boolean IS NULL OR pinned = ${pinnedFilter})
  `;
  const notes = await sql`
    SELECT id, title, body, tags, pinned, created_at, updated_at
    FROM notes
    WHERE TRUE
      AND user_id = ${req.user.id}
      AND (${searchPattern}::text IS NULL OR title ILIKE ${searchPattern} OR body ILIKE ${searchPattern})
      AND (${tagFilter}::text IS NULL OR ${tagFilter} = ANY(tags))
      AND (${pinnedFilter}::boolean IS NULL OR pinned = ${pinnedFilter})
    ORDER BY pinned DESC, updated_at DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `;

  res.json({ notes, total: Number(countResult.total), page, limit });
});

router.get("/:id", validate(noteIdParamsSchema, "params"), async (req, res) => {
  const [note] = await sql`
    SELECT id, title, body, tags, pinned, created_at, updated_at
    FROM notes
    WHERE id = ${req.params.id}
      AND user_id = ${req.user.id}
  `;

  if (!note) {
    res.status(404).json({ error: { message: "Note not found" } });
    return;
  }

  res.json({ note });
});

router.post("/", validate(createNoteSchema), async (req, res) => {
  const { title, body, tags, pinned } = req.body;
  const [note] = await sql`
    INSERT INTO notes (user_id, title, body, tags, pinned)
    VALUES (${req.user.id}, ${title}, ${body}, ${tags}, ${pinned})
    RETURNING id, title, body, tags, pinned, created_at, updated_at
  `;

  res.status(201).json({ note });
});

router.patch(
  "/:id",
  validate(noteIdParamsSchema, "params"),
  validate(updateNoteSchema),
  async (req, res) => {
    if (Object.keys(req.body).length === 0) {
      res.status(422).json({
        error: {
          message: "Validation failed",
          details: { body: ["At least one field must be provided"] },
        },
      });
      return;
    }

    const { title, body, tags, pinned } = req.body;
    const [note] = await sql`
      UPDATE notes
      SET title = COALESCE(${title ?? null}, title),
          body = COALESCE(${body ?? null}, body),
          tags = COALESCE(${tags ?? null}, tags),
          pinned = COALESCE(${pinned ?? null}, pinned),
          updated_at = now()
      WHERE id = ${req.params.id}
        AND user_id = ${req.user.id}
      RETURNING id, title, body, tags, pinned, created_at, updated_at
    `;

    if (!note) {
      res.status(404).json({ error: { message: "Note not found" } });
      return;
    }

    res.json({ note });
  },
);

router.delete("/:id", validate(noteIdParamsSchema, "params"), async (req, res) => {
  const [note] = await sql`
    DELETE FROM notes
    WHERE id = ${req.params.id}
      AND user_id = ${req.user.id}
    RETURNING id
  `;

  if (!note) {
    res.status(404).json({ error: { message: "Note not found" } });
    return;
  }

  res.status(204).end();
});

export default router;
