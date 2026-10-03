const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");

const router = express.Router();

/* =========================================================
   POST /api/customers
   Create a Customer (role forced to 'customer')
   Body: { name, email, phone?, password }
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
       VALUES (?, ?, ?, ?, 'customer', 'active')`,
      [name, email, phone || null, hashedPassword]
    );

    return res.status(201).json({
      success: true,
      message: "Customer created successfully",
      data: {
        id: result.insertId,
        name,
        email,
        phone: phone || null,
        role: "customer",
      },
    });
  } catch (err) {
    console.error("Create customer error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to create customer",
      error: err.message,
    });
  }
});

/* =========================================================
   POST /api/customers/login
   Body: { email, password }
   Only allows role === 'customer'
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

    // Compare password with hashed password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Role check — only customer allowed on this endpoint
    if (user.role !== "customer") {
      return res.status(403).json({
        success: false,
        message: "Access denied. You are not a customer.",
      });
    }

    // Status check
    if (user.status !== "active") {
      return res.status(403).json({
        success: false,
        message: "Your account is inactive. Contact support.",
      });
    }

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
      token: `customer-${user.id}-${Date.now()}`,
    });
  } catch (err) {
    console.error("Customer login error:", err);
    return res.status(500).json({
      success: false,
      message: "Login failed",
      error: err.message,
    });
  }
});

/* =========================================================
   GET /api/customers
   List all customers
   ========================================================= */
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, name, email, phone, role, status, created_at
       FROM users
       WHERE role = 'customer'
       ORDER BY created_at DESC`
    );

    return res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    console.error("List customers error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch customers",
      error: err.message,
    });
  }
});

/* =========================================================
   GET /api/customers/:id
   ========================================================= */
router.get("/:id", async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, name, email, phone, role, status, created_at
       FROM users
       WHERE id = ? AND role = 'customer'
       LIMIT 1`,
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error("Get customer error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch customer",
      error: err.message,
    });
  }
});

/* =========================================================
   PUT /api/customers/:id
   Update customer (name, email, phone, password, status)
   ========================================================= */
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, password, status } = req.body;

    const [existing] = await db.query(
      "SELECT id FROM users WHERE id = ? AND role = 'customer' LIMIT 1",
      [id]
    );
    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    const fields = [];
    const values = [];

    if (name) {
      fields.push("name = ?");
      values.push(name);
    }
    if (email) {
      fields.push("email = ?");
      values.push(email);
    }
    if (phone !== undefined) {
      fields.push("phone = ?");
      values.push(phone);
    }
    if (status && ["active", "inactive"].includes(status)) {
      fields.push("status = ?");
      values.push(status);
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

    return res.json({ success: true, message: "Customer updated successfully" });
  } catch (err) {
    console.error("Update customer error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to update customer",
      error: err.message,
    });
  }
});

/* =========================================================
   DELETE /api/customers/:id
   ========================================================= */
router.delete("/:id", async (req, res) => {
  try {
    const [result] = await db.query(
      "DELETE FROM users WHERE id = ? AND role = 'customer'",
      [req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    return res.json({ success: true, message: "Customer deleted successfully" });
  } catch (err) {
    console.error("Delete customer error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to delete customer",
      error: err.message,
    });
  }
});

module.exports = router;