/**
 * ocrService.js
 *
 * Client-side image utilities.
 * Actual OCR processing happens on the backend via EasyOCR.
 * This file handles file validation and local preview generation.
 */

const ALLOWED_TYPES = new Set([
  "image/jpeg", "image/jpg", "image/png",
  "image/gif",  "image/webp", "image/bmp",
]);
const MAX_SIZE_MB = 10;

/**
 * Validate an image File object.
 * @returns {string|null}  Error message, or null if valid.
 */
export function validateImageFile(file) {
  if (!file) return "No file selected.";
  if (!ALLOWED_TYPES.has(file.type)) {
    return "Only JPEG, PNG, GIF, WebP, and BMP files are supported.";
  }
  if (file.size > MAX_SIZE_MB * 1024 * 1024) {
    return `Image must be under ${MAX_SIZE_MB} MB.`;
  }
  return null;
}

/**
 * Read a File and return a base64 data URL for canvas/img preview.
 * @param {File} file
 * @returns {Promise<string>}
 */
export function createImagePreview(file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error("No file provided"));
    const reader = new FileReader();
    reader.onload  = (e) => resolve(e.target.result);
    reader.onerror = ()  => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}
