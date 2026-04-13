require("dotenv").config();
require("./config/db");

const Department = require("./models/Department");

setTimeout(async () => {
  await Department.deleteMany({});

  await Department.insertMany([
    { department_id: "DEPT001", department_name: "Revenue Department" },
    { department_id: "DEPT002", department_name: "Social Welfare Department" },
    { department_id: "DEPT003", department_name: "District Collectorate" },
    { department_id: "DEPT004", department_name: "Tehsil Office" },
    { department_id: "DEPT005", department_name: "Municipal Corporation" }
  ]);

  console.log("Departments seeded successfully!");
  console.log("Department IDs: DEPT001, DEPT002, DEPT003, DEPT004, DEPT005");
  process.exit(0);
}, 2000);