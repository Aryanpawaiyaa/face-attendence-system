const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');

const uploadRoot = path.join(process.cwd(), env.upload.dir);
const studentPhotoDir = path.join(uploadRoot, 'students');

// Ensure the target directory exists on boot.
[uploadRoot, studentPhotoDir].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, studentPhotoDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const unique = crypto.randomBytes(16).toString('hex');
    cb(null, `${Date.now()}-${unique}${ext}`);
  },
});

function fileFilter(req, file, cb) {
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    return cb(ApiError.badRequest('Only JPEG, PNG, or WEBP images are allowed'));
  }
  return cb(null, true);
}

const uploadStudentPhoto = multer({
  storage,
  fileFilter,
  limits: { fileSize: env.upload.maxSizeMb * 1024 * 1024 },
});

module.exports = { uploadStudentPhoto, studentPhotoDir };
