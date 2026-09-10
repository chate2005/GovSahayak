const User = require("../models/User");
const Department = require("../models/Department");
const PasswordReset = require("../models/PasswordReset");
const OTP = require("../models/OTP");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const transactionalEmailsApi = require("../config/mailer");
const SibApiV3Sdk = require("sib-api-v3-sdk");

function validatePassword(password) {
  const errors = [];
  if (password.length < 8) errors.push("At least 8 characters");
  if (!/[A-Z]/.test(password)) errors.push("At least one uppercase letter");
  if (!/[0-9]/.test(password)) errors.push("At least one number");
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password))
    errors.push("At least one special character");
  return errors;
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// USER REGISTER
exports.register = async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;

    if (!name || !email || !password || !phone) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (name.trim().length < 2) {
      return res.status(400).json({ message: "Name must be at least 2 characters" });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    const passwordErrors = validatePassword(password);
    if (passwordErrors.length > 0) {
      return res.status(400).json({
        message: "Password does not meet requirements",
        errors: passwordErrors
      });
    }

    const phoneRegex = /^[6-9]\d{9}$/;
    if (!phoneRegex.test(phone)) {
      return res.status(400).json({
        message: "Enter a valid 10 digit Indian mobile number"
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const exist = await User.findOne({ email: normalizedEmail });
    if (exist) {
      return res.status(400).json({ message: "Email already registered" });
    }

    const phoneExist = await User.findOne({ phone });
    if (phoneExist) {
      return res.status(400).json({ message: "Phone number already registered" });
    }

    // ── OTP Email Verification Guard ─────────────────────────────────────────
    const verifiedOtp = await OTP.findOne({ email: normalizedEmail, verified: true });
    if (!verifiedOtp) {
      return res.status(400).json({
        message: "Email not verified. Please verify the OTP sent to your email before completing registration."
      });
    }
    if (new Date() > verifiedOtp.verified_expires_at) {
      await OTP.deleteMany({ email: normalizedEmail });
      return res.status(400).json({
        message: "Email verification has expired. Please request a new OTP and verify again."
      });
    }
    // ─────────────────────────────────────────────────────────────────────────

    const hashed = await bcrypt.hash(password, 10);
    const user = new User({
      name: name.trim(),
      email: normalizedEmail,
      password: hashed,
      phone,
      phone_verified: true,
      email_verified: true,
      role: "user"
    });

    await user.save();
    // Clean up verified OTP record now that registration is complete
    await OTP.deleteMany({ email: normalizedEmail });
    console.log("User saved:", user._id);

    const token = jwt.sign(
      { userId: user._id, role: "user" },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      message: "User registered successfully",
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role
      }
    });

  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ message: "Registration failed: " + err.message });
  }
};

// OFFICER REGISTER
exports.registerOfficer = async (req, res) => {
  try {
    const { name, email, password, phone, department_id } = req.body;

    console.log("Officer register attempt:", email, department_id);

    if (!name || !email || !password || !phone || !department_id) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (name.trim().length < 2) {
      return res.status(400).json({ message: "Name must be at least 2 characters" });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    const passwordErrors = validatePassword(password);
    if (passwordErrors.length > 0) {
      return res.status(400).json({
        message: "Password does not meet requirements",
        errors: passwordErrors
      });
    }

    const phoneRegex = /^[6-9]\d{9}$/;
    if (!phoneRegex.test(phone)) {
      return res.status(400).json({
        message: "Enter a valid 10 digit Indian mobile number"
      });
    }

    // Validate department ID
    const department = await Department.findOne({
      department_id: department_id.toUpperCase(),
      active: true
    });

    if (!department) {
      return res.status(400).json({
        message: "Invalid Department ID. Please contact your administrator."
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const exist = await User.findOne({ email: normalizedEmail });
    if (exist) {
      return res.status(400).json({ message: "Email already registered" });
    }

    const phoneExist = await User.findOne({ phone });
    if (phoneExist) {
      return res.status(400).json({ message: "Phone number already registered" });
    }

    // ── OTP Email Verification Guard ─────────────────────────────────────────
    const verifiedOtp = await OTP.findOne({ email: normalizedEmail, verified: true });
    if (!verifiedOtp) {
      return res.status(400).json({
        message: "Email not verified. Please verify the OTP sent to your email before completing registration."
      });
    }
    if (new Date() > verifiedOtp.verified_expires_at) {
      await OTP.deleteMany({ email: normalizedEmail });
      return res.status(400).json({
        message: "Email verification has expired. Please request a new OTP and verify again."
      });
    }
    // ─────────────────────────────────────────────────────────────────────────

    const hashed = await bcrypt.hash(password, 10);
    const officer = new User({
      name: name.trim(),
      email: normalizedEmail,
      password: hashed,
      phone,
      phone_verified: true,
      email_verified: true,
      role: "officer",
      department_id: department.department_id,
      department_name: department.department_name
    });

    await officer.save();
    // Clean up verified OTP record now that registration is complete
    await OTP.deleteMany({ email: normalizedEmail });
    console.log("Officer saved:", officer._id, department.department_name);

    const token = jwt.sign(
      { userId: officer._id, role: "officer" },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      message: "Officer registered successfully",
      token,
      user: {
        _id: officer._id,
        name: officer.name,
        email: officer.email,
        phone: officer.phone,
        role: officer.role,
        department_id: officer.department_id,
        department_name: officer.department_name
      }
    });

  } catch (err) {
    console.error("Officer register error:", err);
    res.status(500).json({ message: "Registration failed: " + err.message });
  }
};

// USER LOGIN
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(400).json({ message: "No account found with this email" });
    }

    // Make sure regular users cannot login as officers here
    if (user.role === "officer") {
      return res.status(400).json({
        message: "Please use the Officer Login screen"
      });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(400).json({ message: "Incorrect password" });
    }

    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      message: "Login successful",
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role
      }
    });

  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Login failed: " + err.message });
  }
};

// OFFICER LOGIN
exports.loginOfficer = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    const officer = await User.findOne({ email: email.toLowerCase().trim() });
    if (!officer) {
      return res.status(400).json({ message: "No officer account found with this email" });
    }

    // Only officers can login here
    if (officer.role !== "officer") {
      return res.status(400).json({
        message: "This account is not registered as an officer"
      });
    }

    const match = await bcrypt.compare(password, officer.password);
    if (!match) {
      return res.status(400).json({ message: "Incorrect password" });
    }

    const token = jwt.sign(
      { userId: officer._id, role: "officer" },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    console.log("Officer login success:", officer._id, officer.department_name);

    res.json({
      message: "Officer login successful",
      token,
      user: {
        _id: officer._id,
        name: officer.name,
        email: officer.email,
        phone: officer.phone,
        role: officer.role,
        department_id: officer.department_id,
        department_name: officer.department_name
      }
    });

  } catch (err) {
    console.error("Officer login error:", err);
    res.status(500).json({ message: "Login failed: " + err.message });
  }
};

// FORGOT PASSWORD
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });

    if (!user) {
      return res.json({
        message: "If this email is registered, a reset code has been sent"
      });
    }

    await PasswordReset.deleteMany({ email: email.toLowerCase() });

    const code = generateCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await PasswordReset.create({
      email: email.toLowerCase(),
      code,
      expires_at: expiresAt
    });

    console.log(`Reset code for ${email}: ${code}`);

    const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
    sendSmtpEmail.subject = "Senate Bot — Password Reset Code";
    sendSmtpEmail.to = [{ email }];
    sendSmtpEmail.sender = {
      email: process.env.BREVO_FROM_EMAIL,
      name: "Senate Bot"
    };
    sendSmtpEmail.htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto;">
        <div style="background-color: #1A3C6E; padding: 20px; text-align: center;">
          <h2 style="color: white; margin: 0;">Senate Bot</h2>
          <p style="color: #ccc; margin: 5px 0;">Government Services Portal</p>
        </div>
        <div style="padding: 30px; background: #f9f9f9;">
          <h3 style="color: #1A3C6E;">Password Reset Code</h3>
          <p>Hello <strong>${user.name}</strong>,</p>
          <p>Your password reset code is:</p>
          <div style="background: #1A3C6E; color: white; font-size: 36px;
            font-weight: bold; text-align: center; padding: 20px;
            border-radius: 8px; letter-spacing: 10px; margin: 20px 0;">
            ${code}
          </div>
          <p style="color: #666;">This code expires in <strong>10 minutes</strong>.</p>
          <p style="color: #666;">If you did not request this, please ignore this email.</p>
        </div>
        <div style="background: #eee; padding: 15px; text-align: center;">
          <p style="color: #999; font-size: 12px; margin: 0;">
            Senate Bot — Government Services Portal
          </p>
        </div>
      </div>
    `;

    await transactionalEmailsApi.sendTransacEmail(sendSmtpEmail);

    res.json({
      message: "If this email is registered, a reset code has been sent"
    });

  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).json({ message: "Failed to send reset code" });
  }
};

// VERIFY RESET CODE
exports.verifyResetCode = async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ message: "Email and code are required" });
    }

    const record = await PasswordReset.findOne({ email: email.toLowerCase() });

    if (!record) {
      return res.status(400).json({
        message: "No reset code found. Please request a new one."
      });
    }

    if (new Date() > record.expires_at) {
      await PasswordReset.deleteMany({ email });
      return res.status(400).json({
        message: "Code has expired. Please request a new one."
      });
    }

    if (record.code !== code.trim()) {
      return res.status(400).json({ message: "Invalid code. Please try again." });
    }

    res.json({ message: "Code verified", verified: true });

  } catch (err) {
    res.status(500).json({ message: "Verification failed" });
  }
};

// RESET PASSWORD
exports.resetPassword = async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const passwordErrors = validatePassword(newPassword);
    if (passwordErrors.length > 0) {
      return res.status(400).json({
        message: "Password does not meet requirements",
        errors: passwordErrors
      });
    }

    const record = await PasswordReset.findOne({
      email: email.toLowerCase(),
      code
    });

    if (!record) {
      return res.status(400).json({ message: "Invalid or expired code" });
    }

    if (new Date() > record.expires_at) {
      await PasswordReset.deleteMany({ email });
      return res.status(400).json({
        message: "Code has expired. Please request a new one."
      });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await User.findOneAndUpdate(
      { email: email.toLowerCase() },
      { password: hashed }
    );

    await PasswordReset.deleteMany({ email });

    res.json({ message: "Password reset successfully" });

  } catch (err) {
    res.status(500).json({ message: "Password reset failed" });
  }
};