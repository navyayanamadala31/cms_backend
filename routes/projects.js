const express = require("express");
const db = require("../db");

const router = express.Router();

/* =========================================================
   Helper — insert notifications for a list of user ids
   Silently ignores errors so it never breaks the main flow.
   ========================================================= */
const notifyUsers = async (userIds, { ticket_id, title, message, type }) => {
  const ids = (userIds || []).filter((v) => v !== null && v !== undefined);
  if (ids.length === 0) {
    console.log("🔔 notifyUsers skipped — no recipients");
    return;
  }

  try {
    const values = ids.map((uid) => [uid, ticket_id, title, message, type]);
    await db.query(
      `INSERT INTO notifications
        (user_id, ticket_id, title, message, type)
       VALUES ?`,
      [values]
    );
    console.log(`🔔 Notified users [${ids.join(",")}] — ${type}`);
  } catch (err) {
    console.error("🔔 Notify users FAILED:", err.message);
  }
};

/* =========================================================
   POST /api/projects
   ========================================================= */
router.post("/", async (req, res) => {
  try {
    const {
      name,
      description = null,
      start_date = null,
      end_date = null,
      customer_id = null,
      admin_id = null,
      teamlead_id = null,
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Project name is required",
      });
    }

    const [result] = await db.query(
      `INSERT INTO projects
        (name, description, start_date, end_date, customer_id, admin_id, teamlead_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        name.trim(),
        description || null,
        start_date || null,
        end_date || null,
        customer_id || null,
        admin_id || null,
        teamlead_id || null,
      ]
    );

    // ---- Notify all admins about the new project ----
    const [admins] = await db.query(
      "SELECT id FROM users WHERE role IN ('admin','superadmin') AND status = 'active'"
    );
    await notifyUsers(
      admins.map((a) => a.id),
      {
        ticket_id: result.insertId, // reuse the column as a generic "entity id"
        title: "New project created",
        message: `${name.trim()} — project #${result.insertId}`,
        type: "PROJECT_CREATED",
      }
    );

    return res.status(201).json({
      success: true,
      message: "Project created successfully",
      data: {
        id: result.insertId,
        name,
        description: description || null,
        start_date: start_date || null,
        end_date: end_date || null,
        customer_id: customer_id || null,
        admin_id: admin_id || null,
        teamlead_id: teamlead_id || null,
      },
    });
  } catch (err) {
    console.error("Create project error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to create project",
      error: err.message,
    });
  }
});

/* =========================================================
   GET /api/projects
   ========================================================= */
router.get("/", async (_req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT
         p.id, p.name, p.description, p.start_date, p.end_date,
         p.customer_id, p.admin_id, p.teamlead_id,
         p.status, p.progress_notes, p.created_at, p.updated_at,
         c.name AS customer_name, c.email AS customer_email,
         a.name AS admin_name,    a.email AS admin_email,
         t.name AS teamlead_name, t.email AS teamlead_email
       FROM projects p
       LEFT JOIN users c ON c.id = p.customer_id
       LEFT JOIN users a ON a.id = p.admin_id
       LEFT JOIN users t ON t.id = p.teamlead_id
       ORDER BY p.created_at DESC`
    );

    return res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    console.error("List projects error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch projects",
      error: err.message,
    });
  }
});

/* =========================================================
   GET /api/projects/:id
   ========================================================= */
router.get("/:id", async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT
         p.id, p.name, p.description, p.start_date, p.end_date,
         p.customer_id, p.admin_id, p.teamlead_id,
         p.status, p.progress_notes, p.created_at, p.updated_at,
         c.name AS customer_name, c.email AS customer_email,
         a.name AS admin_name,    a.email AS admin_email,
         t.name AS teamlead_name, t.email AS teamlead_email
       FROM projects p
       LEFT JOIN users c ON c.id = p.customer_id
       LEFT JOIN users a ON a.id = p.admin_id
       LEFT JOIN users t ON t.id = p.teamlead_id
       WHERE p.id = ?
       LIMIT 1`,
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error("Get project error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch project",
      error: err.message,
    });
  }
});

/* =========================================================
   PUT /api/projects/:id
   ========================================================= */
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      start_date,
      end_date,
      customer_id,
      admin_id,
      teamlead_id,
      status,
      progress_notes,
    } = req.body;

    // ---- Fetch current state so we can build smart notifications ----
    const [existing] = await db.query(
      "SELECT id, name, customer_id, admin_id, teamlead_id, status FROM projects WHERE id = ? LIMIT 1",
      [id]
    );
    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    const before = existing[0];

    const fields = [];
    const values = [];

    if (name) {
      fields.push("name = ?");
      values.push(name);
    }
    if (description !== undefined) {
      fields.push("description = ?");
      values.push(description);
    }
    if (start_date !== undefined) {
      fields.push("start_date = ?");
      values.push(start_date || null);
    }
    if (end_date !== undefined) {
      fields.push("end_date = ?");
      values.push(end_date || null);
    }
    if (customer_id !== undefined) {
      fields.push("customer_id = ?");
      values.push(customer_id || null);
    }
    if (admin_id !== undefined) {
      fields.push("admin_id = ?");
      values.push(admin_id || null);
    }
    if (teamlead_id !== undefined) {
      fields.push("teamlead_id = ?");
      values.push(teamlead_id || null);
    }
    if (
      status &&
      ["ASSIGNED", "IN_PROGRESS", "COMPLETED", "ON_HOLD", "CLOSED"].includes(
        status
      )
    ) {
      fields.push("status = ?");
      values.push(status);
    }
    if (progress_notes !== undefined) {
      fields.push("progress_notes = ?");
      values.push(progress_notes);
    }

    if (fields.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No fields to update",
      });
    }

    values.push(id);
    await db.query(
      `UPDATE projects SET ${fields.join(", ")} WHERE id = ?`,
      values
    );

    /* =========================================================
       NOTIFICATIONS
       ========================================================= */

    // 1. Teamlead was just assigned → notify the teamlead
    if (
      teamlead_id !== undefined &&
      teamlead_id !== null &&
      Number(teamlead_id) !== Number(before.teamlead_id)
    ) {
      await notifyUsers(
        [teamlead_id],
        {
          ticket_id: Number(id),
          title: "New project assigned to you",
          message: `Project "${before.name}" has been assigned to you.`,
          type: "PROJECT_ASSIGNED",
        }
      );
    }

    // 2. Status changed to IN_PROGRESS or COMPLETED → notify customer + admin
    const statusChanged = status && status !== before.status;
    if (statusChanged && (status === "IN_PROGRESS" || status === "COMPLETED")) {
      const recipients = [
        before.customer_id, // customer
        before.admin_id,    // admin
      ];

      const title =
        status === "COMPLETED"
          ? "Project completed"
          : "Project in progress";

      const message =
        status === "COMPLETED"
          ? `Project "${before.name}" has been completed.${
              progress_notes ? ` Notes: ${progress_notes}` : ""
            }`
          : `Project "${before.name}" is now in progress.${
              progress_notes ? ` Notes: ${progress_notes}` : ""
            }`;

      await notifyUsers(recipients, {
        ticket_id: Number(id),
        title,
        message,
        type:
          status === "COMPLETED"
            ? "PROJECT_COMPLETED"
            : "PROJECT_IN_PROGRESS",
      });
    }

    return res.json({ success: true, message: "Project updated successfully" });
  } catch (err) {
    console.error("Update project error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to update project",
      error: err.message,
    });
  }
});

/* =========================================================
   DELETE /api/projects/:id
   ========================================================= */
router.delete("/:id", async (req, res) => {
  try {
    const [result] = await db.query(
      "DELETE FROM projects WHERE id = ?",
      [req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    return res.json({ success: true, message: "Project deleted successfully" });
  } catch (err) {
    console.error("Delete project error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to delete project",
      error: err.message,
    });
  }
});

module.exports = router;