const stringSimilarity = require('string-similarity');

app = {
  dob: "05/04/2026",
  child_name: "Aryan Rajesh Patil",
  place_of_birth: "City General Hospital",
  father_name: "Rajesh Suresh Patil",
  mother_name: "Sunita Rajesh patil"
};

ocrProof = {
  dob: "05/04/2026",
  child_name: "Aryan Rajesh Patil",
  place_of_birth: "City General Hospital Pune",
  father_name: "Rajesh Suresh Patil",
  mother_name: "Sunita Rajesh Patil"
};

aadhaarDetails = {
  name: "Rajesh Suresh Patil",
  dob: "12/06/1990"
};

let flags = [];
const fatherSim = stringSimilarity.compareTwoStrings(aadhaarDetails.name.toLowerCase(), app.father_name.toLowerCase());
const motherSim = stringSimilarity.compareTwoStrings(aadhaarDetails.name.toLowerCase(), app.mother_name.toLowerCase());

let parent_detected = null;
if (fatherSim >= 0.85) parent_detected = "father";
else if (motherSim >= 0.85) parent_detected = "mother";
else flags.push("UNKNOWN_PARENT_DOCUMENT");

// Rule 1: DOB
const cDOB = new Date(app.dob.split('/').reverse().join('-'));
if (cDOB > new Date()) flags.push("DOB_MISMATCH (Future Date)");
if (!ocrProof.dob) {
  flags.push("LOW_CONFIDENCE_OCR (Birth Proof DOB)");
} else {
  if (ocrProof.dob.replace(/[\/\-]/g, '') !== app.dob.replace(/[\/\-]/g, '')) {
      flags.push("DOB_MISMATCH");
  }
}

// Rule 2
if (stringSimilarity.compareTwoStrings(ocrProof.child_name.toLowerCase(), app.child_name.toLowerCase()) < 0.85) {
   flags.push("NAME_MISMATCH");
}

// Rule 5
if (stringSimilarity.compareTwoStrings(ocrProof.place_of_birth.toLowerCase(), app.place_of_birth.toLowerCase()) < 0.70) {
    flags.push("PLACE_MISMATCH");
}

console.log("FLAGS:", flags);
console.log("similarity place:", stringSimilarity.compareTwoStrings(ocrProof.place_of_birth.toLowerCase(), app.place_of_birth.toLowerCase()));
console.log("cDOB:", cDOB, "now:", new Date(), "isFuture?", cDOB > new Date());
