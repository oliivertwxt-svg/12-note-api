import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import request from "supertest";

if (!process.env.TEST_DATABASE_URL) {
  throw new Error(
    "TEST_DATABASE_URL is required. Point it to a separate Neon test branch.",
  );
}
if (
  process.env.DATABASE_URL &&
  process.env.TEST_DATABASE_URL === process.env.DATABASE_URL
) {
  throw new Error("TEST_DATABASE_URL must not point to the DATABASE_URL database.");
}

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.JWT_SECRET = "node-test-only-secret-at-least-32-characters";
process.env.NODE_ENV = "test";

const [{ default: app }, { sql }] = await Promise.all([
  import("../src/app.js"),
  import("../src/db.js"),
]);

test("authentication and notes ownership", async (t) => {
  const suffix = randomUUID();
  const registerEmail = `register-${suffix}@example.test`;
  const ownerEmail = `owner-${suffix}@example.test`;
  const otherEmail = `other-${suffix}@example.test`;

  try {
    let registerToken;
    await t.test("register and login return a public user and token", async () => {
      const registered = await request(app)
        .post("/api/auth/register")
        .send({
          name: "Test User",
          email: registerEmail.toUpperCase(),
          password: "securepass123",
        });

      assert.equal(registered.status, 201);
      assert.equal(registered.body.user.email, registerEmail);
      assert.equal("password_hash" in registered.body.user, false);
      assert.equal(typeof registered.body.token, "string");

      const loggedIn = await request(app)
        .post("/api/auth/login")
        .send({ email: registerEmail.toUpperCase(), password: "securepass123" });

      assert.equal(loggedIn.status, 200);
      assert.equal(loggedIn.body.user.id, registered.body.user.id);
      assert.equal("password_hash" in loggedIn.body.user, false);
      assert.equal(typeof loggedIn.body.token, "string");
      registerToken = loggedIn.body.token;

      const me = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${registerToken}`);
      assert.equal(me.status, 200);
      assert.equal(me.body.user.id, registered.body.user.id);
    });

    await t.test("notes routes require authentication", async () => {
      const response = await request(app).get("/api/notes");
      assert.equal(response.status, 401);
      assert.match(response.headers["www-authenticate"], /^Bearer/);
    });

    await t.test("a user cannot read, update, or delete another user's note", async () => {
      const ownerRegistration = await request(app)
        .post("/api/auth/register")
        .send({
          name: "Note Owner",
          email: ownerEmail,
          password: "ownerpass123",
        });
      assert.equal(ownerRegistration.status, 201);

      const otherRegistration = await request(app)
        .post("/api/auth/register")
        .send({
          name: "Other User",
          email: otherEmail,
          password: "otherpass123",
        });
      assert.equal(otherRegistration.status, 201);

      const ownerToken = ownerRegistration.body.token;
      const otherToken = otherRegistration.body.token;
      const created = await request(app)
        .post("/api/notes")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          title: "Private note",
          body: "Only the owner should see this",
          tags: ["private"],
        });

      assert.equal(created.status, 201);
      const noteId = created.body.note.id;
      const missing = await request(app)
        .get(`/api/notes/${randomUUID()}`)
        .set("Authorization", `Bearer ${otherToken}`);
      const foreign = await request(app)
        .get(`/api/notes/${noteId}`)
        .set("Authorization", `Bearer ${otherToken}`);
      assert.equal(missing.status, 404);
      assert.equal(foreign.status, 404);
      assert.deepEqual(foreign.body, missing.body);

      const updated = await request(app)
        .patch(`/api/notes/${noteId}`)
        .set("Authorization", `Bearer ${otherToken}`)
        .send({ title: "Attempted takeover" });
      assert.equal(updated.status, 404);

      const deleted = await request(app)
        .delete(`/api/notes/${noteId}`)
        .set("Authorization", `Bearer ${otherToken}`);
      assert.equal(deleted.status, 404);

      const ownerRead = await request(app)
        .get(`/api/notes/${noteId}`)
        .set("Authorization", `Bearer ${ownerToken}`);
      assert.equal(ownerRead.status, 200);
      assert.equal(ownerRead.body.note.title, "Private note");
    });
  } finally {
    await sql`
      DELETE FROM users
      WHERE email = ${registerEmail}
        OR email = ${ownerEmail}
        OR email = ${otherEmail}
    `;
  }
});
