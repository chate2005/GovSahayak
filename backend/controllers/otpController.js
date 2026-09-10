const OTP = require("../models/otp");
const User = require("../models/User");
const transactionalEmailsApi = require("../config/mailer");
const SibApiV3Sdk = require("sib-api-v3-sdk");

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

exports.sendOTP = async (req, res) => {
  try {
    const email = (req.body.email || "").toLowerCase().trim();

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    // Block if email is already registered
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        message: "This email is already registered. Please login or reset your password."
      });
    }

    await OTP.deleteMany({ email });

    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await OTP.create({ email, otp, expires_at: expiresAt, verified: false });

    console.log(`OTP for ${email}: ${otp}`);

    const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
    sendSmtpEmail.subject = "GovSahayak — Email Verification OTP";
    sendSmtpEmail.to = [{ email }];
    sendSmtpEmail.sender = {
      email: process.env.BREVO_FROM_EMAIL,
      name: process.env.BREVO_FROM_NAME || "GovSahayak"
    };
    sendSmtpEmail.htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #002060 0%, #003087 60%, #1a4db5 100%); padding: 28px 24px; text-align: center;">
          <h2 style="color: white; margin: 0; font-size: 22px; letter-spacing: 1px;">🇮🇳 GovSahayak</h2>
          <p style="color: #b3c6f0; margin: 6px 0 0; font-size: 13px;">ई-प्रमाण पत्र सेवा | e-Certificate Portal</p>
        </div>
        <div style="padding: 32px 28px; background: #f9fafb;">
          <h3 style="color: #1A3C6E; margin-top: 0;">Email Verification Code</h3>
          <p style="color: #374151;">Please use the following One-Time Password (OTP) to verify your email address:</p>
          <div style="background: linear-gradient(135deg, #002060 0%, #003087 100%); color: white; font-size: 38px;
            font-weight: bold; text-align: center; padding: 22px;
            border-radius: 10px; letter-spacing: 14px; margin: 24px 0;">
            ${otp}
          </div>
          <p style="color: #6b7280; font-size: 14px;">⏱ This OTP is valid for <strong>10 minutes</strong>.</p>
          <p style="color: #6b7280; font-size: 13px;">If you did not attempt to register on GovSahayak, please ignore this email.</p>
        </div>
        <div style="background: #e9ecef; padding: 14px; text-align: center;">
          <p style="color: #9ca3af; font-size: 12px; margin: 0;">
            भारत सरकार | Government of India — GovSahayak e-Certificate Portal
          </p>
        </div>
      </div>
    `;

    await transactionalEmailsApi.sendTransacEmail(sendSmtpEmail);
    console.log("OTP email sent to:", email);

    res.json({ message: "OTP sent successfully" });

  } catch (error) {
    console.error("Send OTP error:", error.message);
    res.status(500).json({ message: "Failed to send OTP: " + error.message });
  }
};

exports.verifyOTP = async (req, res) => {
  try {
    const email = (req.body.email || "").toLowerCase().trim();
    const otp = (req.body.otp || "").trim();

    if (!email || !otp) {
      return res.status(400).json({ message: "Email and OTP are required" });
    }

    const record = await OTP.findOne({ email });

    if (!record) {
      return res.status(400).json({
        message: "OTP not found. Please request a new OTP."
      });
    }

    if (new Date() > record.expires_at) {
      await OTP.deleteMany({ email });
      return res.status(400).json({
        message: "OTP has expired. Please request a new one."
      });
    }

    if (record.otp !== otp) {
      return res.status(400).json({ message: "Invalid OTP. Please try again." });
    }

    // Mark as verified but keep the record so /register can confirm it
    // Give 15 more minutes to complete registration
    const verifiedExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await OTP.findByIdAndUpdate(record._id, {
      verified: true,
      verified_expires_at: verifiedExpiresAt
    });

    console.log(`OTP verified for ${email}. Registration window: 15 mins.`);
    res.json({ message: "Email verified successfully", verified: true });

  } catch (error) {
    console.error("Verify OTP error:", error.message);
    res.status(500).json({ message: "Verification failed: " + error.message });
  }
};