const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
const bcrypt = require("bcryptjs");
const mongoose = require("./config/db");
const User = require("./models/User");
const Department = require("./models/Department");

async function seedOfficerAccount() {
  try {
    const officerName = process.env.OFFICER_NAME || "Revenue Officer";
    const officerEmail = (process.env.OFFICER_EMAIL || "officer@revenue.gov.in").toLowerCase().trim();
    const officerPassword = process.env.OFFICER_PASSWORD || "Officer@12345";
    const officerPhone = process.env.OFFICER_PHONE || "9876543210";
    const deptId = (process.env.OFFICER_DEPT_ID || "DEPT001").toUpperCase().trim();
    const deptName = process.env.OFFICER_DEPT_NAME || "Revenue Department";

    // 1. Ensure Department exists
    await Department.findOneAndUpdate(
      { department_id: deptId },
      {
        department_id: deptId,
        department_name: deptName,
        active: true
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );

    // 2. Hash Password
    const hashedPassword = await bcrypt.hash(officerPassword, 10);

    // 3. Upsert Officer Account
    const officer = await User.findOneAndUpdate(
      { email: officerEmail },
      {
        name: officerName,
        email: officerEmail,
        password: hashedPassword,
        phone: officerPhone,
        phone_verified: true,
        email_verified: true,
        role: "officer",
        department_id: deptId,
        department_name: deptName
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );

    console.log("✅ Officer account ready:");
    console.log(`   Email:       ${officer.email}`);
    console.log(`   Password:    ${officerPassword}`);
    console.log(`   Name:        ${officer.name}`);
    console.log(`   Department:  [${officer.department_id}] ${officer.department_name}`);
    console.log(`   User ID:     ${officer._id}`);

    return officer;
  } catch (err) {
    console.error("❌ Failed to seed officer account:", err);
    throw err;
  }
}

// Execute standalone if called directly
if (require.main === module) {
  // Wait for mongoose connection
  const checkDb = setInterval(async () => {
    if (mongoose.connection.readyState === 1) {
      clearInterval(checkDb);
      try {
        await seedOfficerAccount();
        process.exit(0);
      } catch (err) {
        process.exit(1);
      }
    }
  }, 300);
}

module.exports = { seedOfficerAccount };
