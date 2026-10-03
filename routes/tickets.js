const express = require("express");
const db = require("../db");
const upload = require("../middleware/upload");
const router = express.Router();

/* =========================================================
   Helper — insert notifications for a list of user ids
   ========================================================= */
const notifyUsers = async (userIds, { ticket_id, title, message, type }) => {
  const ids = (userIds || []).filter((v) => v !== null && v !== undefined);
  if (ids.length === 0) {
    console.log("🔔 notifyUsers skipped — no recipients");
    return;
  }

  try {
    const values = ids.map((uid) => [uid, ticket_id, title, message, type]);
    const [result] = await db.query(
      `INSERT INTO notifications
        (user_id, ticket_id, title, message, type)
       VALUES ?`,
      [values]
    );
    console.log(`🔔 Notified users [${ids.join(",")}] — ${type}`);
  } catch (err) {
    console.error("🔔 Notify users FAILED:", err.message);
    console.error("   full error:", err);
  }
};

/* =========================================================
   Helper — generate a unique ticket id like TKT-000123
   ========================================================= */
const generateTicketId = async () => {
  const [rows] = await db.query(
    "SELECT id FROM tickets ORDER BY id DESC LIMIT 1"
  );
  const next = (rows[0]?.id || 0) + 1;
  return `TKT-${String(next).padStart(6, "0")}`;
};

/* =========================================================
   POST /api/tickets — accepts multipart/form-data
   ========================================================= */
router.post("/", upload.single("attachment"), async (req, res) => {
  try {
    const body = req.body || {};

    const {
      subject,
      description,
      category = "Other",
      priority = "MEDIUM",
      customer_id = null,
      customer_name = null,
      customer_email = null,
    } = body;

    if (!subject || !subject.trim()) {
      return res.status(400).json({
        success: false,
        message: "Subject is required",
      });
    }
    if (!description || !description.trim()) {
      return res.status(400).json({
        success: false,
        message: "Description is required",
      });
    }

    const allowedPriorities = ["LOW", "MEDIUM", "HIGH", "URGENT"];
    const finalPriority = allowedPriorities.includes(priority)
      ? priority
      : "MEDIUM";

    const attachment_url = req.file ? `/uploads/${req.file.filename}` : null;

    const ticketId = await generateTicketId();

    const [result] = await db.query(
      `INSERT INTO tickets
        (ticket_id, subject, description, category, priority, status,
         customer_id, customer_name, customer_email, attachment_url)
       VALUES (?, ?, ?, ?, ?, 'OPEN', ?, ?, ?, ?)`,
      [
        ticketId,
        subject.trim(),
        description.trim(),
        category,
        finalPriority,
        customer_id || null,
        customer_name || null,
        customer_email || null,
        attachment_url,
      ]
    );

    // ---- Notify all admins about the new ticket ----
    const [admins] = await db.query(
      "SELECT id FROM users WHERE role IN ('admin','superadmin') AND status = 'active'"
    );
    console.log("📥 New ticket → notifying admins:", admins.map((a) => a.id));
    await notifyUsers(
      admins.map((a) => a.id),
      {
        ticket_id: result.insertId,
        title: "New ticket raised",
        message: `${ticketId} — ${subject.trim()}`,
        type: "TICKET_CREATED",
      }
    );

    return res.status(201).json({
      success: true,
      message: "Ticket raised successfully",
      data: {
        id: result.insertId,
        ticket_id: ticketId,
        subject,
        description,
        category,
        priority: finalPriority,
        status: "OPEN",
        customer_id: customer_id || null,
        customer_name: customer_name || null,
        customer_email: customer_email || null,
        attachment_url,
      },
    });
  } catch (err) {
    console.error("Create ticket error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to raise ticket",
      error: err.message,
    });
  }
});

/* =========================================================
   GET /api/tickets
   ========================================================= */
router.get("/", async (req, res) => {
  try {
    const { status, priority, customer_id, assigned_to } = req.query;

    let sql = `SELECT t.*,
                      a.name  AS assigned_to_name,
                      ab.name AS assigned_by_name
               FROM tickets t
               LEFT JOIN users a  ON a.id  = t.assigned_to
               LEFT JOIN users ab ON ab.id = t.assigned_by
               WHERE 1 = 1`;
    const params = [];

    if (status) {
      sql += " AND t.status = ?";
      params.push(status);
    }
    if (priority) {
      sql += " AND t.priority = ?";
      params.push(priority);
    }
    if (customer_id) {
      sql += " AND t.customer_id = ?";
      params.push(customer_id);
    }
    if (assigned_to) {
      sql += " AND t.assigned_to = ?";
      params.push(assigned_to);
    }

    sql += " ORDER BY t.created_at DESC";

    const [rows] = await db.query(sql, params);

    return res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    console.error("List tickets error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch tickets",
      error: err.message,
    });
  }
});

/* =========================================================
   GET /api/tickets/:id
   ========================================================= */
router.get("/:id", async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT t.*,
              a.name  AS assigned_to_name,
              ab.name AS assigned_by_name
       FROM tickets t
       LEFT JOIN users a  ON a.id  = t.assigned_to
       LEFT JOIN users ab ON ab.id = t.assigned_by
       WHERE t.id = ? LIMIT 1`,
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found",
      });
    }

    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error("Get ticket error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch ticket",
      error: err.message,
    });
  }
});

/* =========================================================
   PUT /api/tickets/:id
   ========================================================= */
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      status,
      priority,
      assigned_to,
      assigned_by,
      resolution_notes,
    } = req.body;

    const [existing] = await db.query(
      "SELECT id, customer_id, assigned_by FROM tickets WHERE id = ? LIMIT 1",
      [id]
    );
    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found",
      });
    }

    const fields = [];
    const values = [];

    if (
      status &&
      ["OPEN", "ASSIGNED", "IN_PROGRESS", "RESOLVED", "CLOSED"].includes(status)
    ) {
      fields.push("status = ?");
      values.push(status);
    }
    if (priority && ["LOW", "MEDIUM", "HIGH", "URGENT"].includes(priority)) {
      fields.push("priority = ?");
      values.push(priority);
    }
    if (assigned_to !== undefined) {
      fields.push("assigned_to = ?");
      values.push(assigned_to);
    }
    if (assigned_by !== undefined) {
      fields.push("assigned_by = ?");
      values.push(assigned_by);
    }
    if (resolution_notes !== undefined) {
      fields.push("resolution_notes = ?");
      values.push(resolution_notes);
    }

    if (fields.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No fields to update",
      });
    }

    values.push(id);
    await db.query(
      `UPDATE tickets SET ${fields.join(", ")} WHERE id = ?`,
      values
    );

    // ---- Notify on assignment ----
    if (status === "ASSIGNED" && assigned_to) {
      console.log(`📥 Ticket #${id} assigned → notifying user ${assigned_to}`);
      await notifyUsers(
        [assigned_to],
        {
          ticket_id: Number(id),
          title: "New ticket assigned to you",
          message: `Ticket #${id} has been assigned to you.`,
          type: "TICKET_ASSIGNED",
        }
      );
    }

    // ---- Notify on resolution ----
    if (status === "RESOLVED") {
      // Notify the customer (if any)
      if (existing[0].customer_id) {
        console.log(
          `📥 Ticket #${id} resolved → notifying customer ${existing[0].customer_id}`
        );
        await notifyUsers(
          [existing[0].customer_id],
          {
            ticket_id: Number(id),
            title: "Your ticket has been resolved",
            message: resolution_notes
              ? `Resolution: ${resolution_notes}`
              : `Ticket #${id} has been resolved.`,
            type: "TICKET_RESOLVED",
          }
        );
      }

      // Notify the admin who assigned it
      const adminToNotify = existing[0].assigned_by || assigned_by;
      if (adminToNotify) {
        console.log(
          `📥 Ticket #${id} resolved → notifying admin ${adminToNotify}`
        );
        await notifyUsers(
          [adminToNotify],
          {
            ticket_id: Number(id),
            title: "Ticket resolved",
            message: `Ticket #${id} was resolved by the team lead.`,
            type: "TICKET_RESOLVED",
          }
        );
      } else {
        console.log(
          `📥 Ticket #${id} resolved → no admin to notify (assigned_by is null)`
        );
      }
    }

    return res.json({ success: true, message: "Ticket updated successfully" });
  } catch (err) {
    console.error("Update ticket error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to update ticket",
      error: err.message,
    });
  }
});

/* =========================================================
   DELETE /api/tickets/:id
   ========================================================= */
router.delete("/:id", async (req, res) => {
  try {
    const [result] = await db.query(
      "DELETE FROM tickets WHERE id = ?",
      [req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found",
      });
    }

    return res.json({ success: true, message: "Ticket deleted successfully" });
  } catch (err) {
    console.error("Delete ticket error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to delete ticket",
      error: err.message,
    });
  }
});

module.exports = router;