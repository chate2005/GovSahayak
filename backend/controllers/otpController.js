const OTP = require("../models/OTP");
const User = require("../models/User");
const transactionalEmailsApi = require("../config/mailer");
const SibApiV3Sdk = require("sib-api-v3-sdk");


function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

exports.sendOTP = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    await OTP.deleteMany({ email });

    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await OTP.create({ email, otp, expires_at: expiresAt, verified: false });

    console.log(`OTP for ${email}: ${otp}`);

    const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
    sendSmtpEmail.subject = "Senate Bot — Email Verification OTP";
    sendSmtpEmail.to = [{ email }];
    sendSmtpEmail.sender = {
      email: process.env.BREVO_FROM_EMAIL,
      name: process.env.BREVO_FROM_NAME || "Senate Bot"
    };
    sendSmtpEmail.htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto;">
        <div style="background-color: #1A3C6E; padding: 20px; text-align: center;">
          <h2 style="color: white; margin: 0;">Senate Bot</h2>
          <p style="color: #ccc; margin: 5px 0;">Government Services Portal</p>
        </div>
        <div style="padding: 30px; background: #f9f9f9;">
          <h3 style="color: #1A3C6E;">Email Verification</h3>
          <p>Your One Time Password (OTP) for registration is:</p>
          <div style="background: #1A3C6E; color: white; font-size: 36px;
            font-weight: bold; text-align: center; padding: 20px;
            border-radius: 8px; letter-spacing: 10px; margin: 20px 0;">
            ${otp}
          </div>
          <p style="color: #666;">This OTP is valid for <strong>10 minutes</strong>.</p>
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
    console.log("OTP email sent to:", email);

    res.json({ message: "OTP sent successfully" });

  } catch (error) {
    console.error("Send OTP error:", error.message);
    res.status(500).json({ message: "Failed to send OTP: " + error.message });
  }
};

exports.verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

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

    if (record.otp !== otp.trim()) {
      return res.status(400).json({ message: "Invalid OTP. Please try again." });
    }

    await OTP.findByIdAndUpdate(record._id, { verified: true });
    await User.findOneAndUpdate({ email }, { email_verified: true });
    await OTP.deleteMany({ email });

    res.json({ message: "Email verified successfully", verified: true });

  } catch (error) {
    console.error("Verify OTP error:", error.message);
    res.status(500).json({ message: "Verification failed: " + error.message });
  }
};