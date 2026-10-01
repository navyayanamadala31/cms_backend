const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");

const router = express.Router();

/* =========================================================
   POST /api/teamleads
   Create a Team Lead
   Body: { name, email, phone, password }
   role is forced to "teamlead"
   ========================================================= */
router.post("/", async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    // ---- Validation ----
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "name, email and password are required",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    // ---- Duplicate check ----
    const [existing] = await db.query(
      "SELECT id FROM users WHERE email = ? LIMIT 1",
      [email]
    );
    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: "A user with this email already exists",
      });
    }

    // ---- Hash password ----
    const hashedPassword = await bcrypt.hash(password, 10);

    // ---- Insert with forced role ----
    const [result] = await db.query(
      `INSERT INTO users (name, email, phone, password, role, status)
       VALUES (?, ?, ?, ?, 'teamlead', 'active')`,
      [name, email, phone || null, hashedPassword]
    );

    return res.status(201).json({
      success: true,
      message: "Team Lead created successfully",
      data: {
        id: result.insertId,
        name,
        email,
        phone: phone || null,
        role: "teamlead",
      },
    });
  } catch (err) {
    console.error("Create teamlead error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to create team lead",
      error: err.message,
    });
  }
});

/* =========================================================
   GET /api/teamleads
   List all team leads
   ========================================================= */
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, name, email, phone, role, status, created_at
       FROM users
       WHERE role = 'teamlead'
       ORDER BY created_at DESC`
    );

    return res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    console.error("List teamleads error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch team leads",
      error: err.message,
    });
  }
});

/* =========================================================
   GET /api/teamleads/:id
   ========================================================= */
router.get("/:id", async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, name, email, phone, role, status, created_at
       FROM users
       WHERE id = ? AND role = 'teamlead'
       LIMIT 1`,
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Team lead not found",
      });
    }

    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error("Get teamlead error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch team lead",
      error: err.message,
    });
  }
});

/* =========================================================
   PUT /api/teamleads/:id
   Update team lead (name, email, phone, password, status)
   ========================================================= */
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, password, status } = req.body;

    const [existing] = await db.query(
      "SELECT id FROM users WHERE id = ? AND role = 'teamlead' LIMIT 1",
      [id]
    );
    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Team lead not found",
      });
    }

    const fields = [];
    const values = [];

    if (name) { fields.push("name = ?"); values.push(name); }
    if (email) { fields.push("email = ?"); values.push(email); }
    if (phone !== undefined) { fields.push("phone = ?"); values.push(phone); }
    if (status && ["active", "inactive"].includes(status)) {
      fields.push("status = ?"); values.push(status);
    }
    if (password) {
      if (password.length < 6) {
        return res.status(400).json({
          success: false,
          message: "Password must be at least 6 characters",
        });
      }
      const hashed = await bcrypt.hash(password, 10);
      fields.push("password = ?");
      values.push(hashed);
    }

    if (fields.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No fields to update",
      });
    }

    values.push(id);
    await db.query(
      `UPDATE users SET ${fields.join(", ")} WHERE id = ?`,
      values
    );

    return res.json({ success: true, message: "Team lead updated successfully" });
  } catch (err) {
    console.error("Update teamlead error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to update team lead",
      error: err.message,
    });
  }
});

/* =========================================================
   DELETE /api/teamleads/:id
   ========================================================= */
router.delete("/:id", async (req, res) => {
  try {
    const [result] = await db.query(
      "DELETE FROM users WHERE id = ? AND role = 'teamlead'",
      [req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Team lead not found",
      });
    }

    return res.json({ success: true, message: "Team lead deleted successfully" });
  } catch (err) {
    console.error("Delete teamlead error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to delete team lead",
      error: err.message,
    });
  }
});


/* =========================================================
   POST /api/teamleads/login
   Body: { email, password }
   Only allows role === 'teamlead'
   ========================================================= */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    // Find user by email
    const [rows] = await db.query(
      `SELECT id, name, email, phone, password, role, status
       FROM users WHERE email = ? LIMIT 1`,
      [email]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const user = rows[0];

    // Compare password with bcrypt hash
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Role check — only teamlead allowed on this endpoint
    if (user.role !== "teamlead") {
      return res.status(403).json({
        success: false,
        message: "Access denied. You are not a team lead.",
      });
    }

    // Status check
    if (user.status !== "active") {
      return res.status(403).json({
        success: false,
        message: "Your account is inactive. Contact admin.",
      });
    }

    // Success — never return password
    return res.json({
      success: true,
      message: "Login successful",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
      token: `teamlead-${user.id}-${Date.now()}`,
    });
  } catch (err) {
    console.error("Team lead login error:", err);
    return res.status(500).json({
      success: false,
      message: "Login failed",
      error: err.message,
    });
  }
});

module.exports = router;