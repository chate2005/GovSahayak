const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const multer = require("multer");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "senate_bot_documents",
    allowed_formats: ["jpg", "jpeg", "png", "pdf", "webp"],  // ← add webp
    resource_type: "auto",
    access_mode: "public"
  }
});

const upload = multer({ storage });

module.exports = { cloudinary, upload };