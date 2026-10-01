const express = require("express");
const db = require("../db");

const router = express.Router();

/* =========================================================
   GET /api/notifications?user_id=5
   List notifications for a user (newest first)
   ========================================================= */
router.get("/", async (req, res) => {
  try {
    const { user_id, unread } = req.query;

    if (!user_id) {
      return res.status(400).json({
        success: false,
        message: "user_id query parameter is required",
      });
    }

    let sql = `SELECT id, user_id, ticket_id, title, message, type,
                      is_read, created_at
               FROM notifications
               WHERE user_id = ?`;
    const params = [user_id];

    if (unread === "true") {
      sql += " AND is_read = 0";
    }

    sql += " ORDER BY created_at DESC LIMIT 100";

    const [rows] = await db.query(sql, params);

    return res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    console.error("List notifications error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch notifications",
      error: err.message,
    });
  }
});

/* =========================================================
   GET /api/notifications/unread-count?user_id=5
   Quick badge count
   ========================================================= */
router.get("/unread-count", async (req, res) => {
  try {
    const { user_id } = req.query;

    if (!user_id) {
      return res.status(400).json({
        success: false,
        message: "user_id query parameter is required",
      });
    }

    const [rows] = await db.query(
      "SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0",
      [user_id]
    );

    return res.json({ success: true, count: rows[0].count });
  } catch (err) {
    console.error("Unread count error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to count",
      error: err.message,
    });
  }
});

/* =========================================================
   PUT /api/notifications/:id/read
   Mark one as read
   ========================================================= */
router.put("/:id/read", async (req, res) => {
  try {
    const [result] = await db.query(
      "UPDATE notifications SET is_read = 1 WHERE id = ?",
      [req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    return res.json({ success: true, message: "Marked as read" });
  } catch (err) {
    console.error("Mark read error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to mark as read",
      error: err.message,
    });
  }
});

/* =========================================================
   PUT /api/notifications/mark-all-read?user_id=5
   ========================================================= */
router.put("/mark-all-read", async (req, res) => {
  try {
    const { user_id } = req.query;

    if (!user_id) {
      return res.status(400).json({
        success: false,
        message: "user_id query parameter is required",
      });
    }

    await db.query(
      "UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0",
      [user_id]
    );

    return res.json({ success: true, message: "All marked as read" });
  } catch (err) {
    console.error("Mark all read error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to mark all as read",
      error: err.message,
    });
  }
});

module.exports = router;