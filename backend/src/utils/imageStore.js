const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const env = require('../config/env');

const ROOT = path.join(process.cwd(), env.upload.dir);

/** Strips any data-URL prefix and returns a Buffer (or null). */
function toBuffer(b64) {
  if (!b64) return null;
  if (Buffer.isBuffer(b64)) return b64;
  const raw = String(b64).includes('base64,') ? String(b64).split('base64,')[1] : String(b64);
  try {
    return Buffer.from(raw, 'base64');
  } catch {
    return null;
  }
}

/** Saves a JPEG under uploads/<folder>/ and returns its public URL path. */
async function saveJpeg(folder, data) {
  const buf = toBuffer(data);
  if (!buf || buf.length < 100) return null;
  const dir = path.join(ROOT, folder);
  await fs.mkdir(dir, { recursive: true });
  const name = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.jpg`;
  await fs.writeFile(path.join(dir, name), buf);
  return `/uploads/${folder}/${name}`;
}

async function readAsBase64(urlPath) {
  if (!urlPath) return null;
  const file = path.join(process.cwd(), urlPath.replace(/^\//, ''));
  if (!file.startsWith(ROOT)) return null;
  try {
    return (await fs.readFile(file)).toString('base64');
  } catch {
    return null;
  }
}

module.exports = { saveJpeg, toBuffer, readAsBase64 };
