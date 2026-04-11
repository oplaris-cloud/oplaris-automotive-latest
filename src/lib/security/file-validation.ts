import "server-only";

import { fileTypeFromBuffer } from "file-type";

/**
 * Server-side file validation for parts invoice uploads.
 *
 * Three checks, in order:
 *   1. Size: ≤ 10 MB
 *   2. Extension: .pdf, .jpg, .jpeg, .png
 *   3. Magic bytes: actual file content matches the claimed extension
 *
 * The magic-byte check is the critical one — it catches `.exe` renamed
 * to `.pdf`, which the extension check alone would miss. We use the
 * `file-type` package which reads the first few bytes of the file and
 * identifies the true MIME type.
 *
 * Returns the validated MIME type on success, or throws with a
 * user-safe error message.
 */

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

const ALLOWED_MIMES = new Map<string, string[]>([
  ["application/pdf", [".pdf"]],
  ["image/jpeg", [".jpg", ".jpeg"]],
  ["image/png", [".png"]],
]);

const ALLOWED_EXTENSIONS = new Set(
  [...ALLOWED_MIMES.values()].flat(),
);

export interface ValidatedFile {
  buffer: Uint8Array;
  mime: string;
  extension: string;
}

export async function validateUpload(
  file: File,
): Promise<ValidatedFile> {
  // 1. Size
  if (file.size > MAX_SIZE) {
    throw new FileValidationError(
      `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 10 MB.`,
    );
  }
  if (file.size === 0) {
    throw new FileValidationError("File is empty.");
  }

  // 2. Extension
  const nameParts = file.name.split(".");
  const ext = nameParts.length > 1 ? `.${nameParts.pop()!.toLowerCase()}` : "";
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new FileValidationError(
      `File type "${ext || "unknown"}" not allowed. Accepted: PDF, JPEG, PNG.`,
    );
  }

  // 3. Magic bytes
  const arrayBuf = await file.arrayBuffer();
  const buffer = new Uint8Array(arrayBuf);
  const detected = await fileTypeFromBuffer(buffer);

  if (!detected) {
    throw new FileValidationError(
      "Could not determine file type from content. The file may be corrupt.",
    );
  }

  if (!ALLOWED_MIMES.has(detected.mime)) {
    throw new FileValidationError(
      `File content is "${detected.mime}" but only PDF, JPEG, and PNG are allowed.`,
    );
  }

  // Cross-check: the detected MIME must be compatible with the claimed extension.
  const allowedExts = ALLOWED_MIMES.get(detected.mime)!;
  if (!allowedExts.includes(ext)) {
    throw new FileValidationError(
      `File extension "${ext}" doesn't match content type "${detected.mime}".`,
    );
  }

  return {
    buffer,
    mime: detected.mime,
    extension: ext,
  };
}

export class FileValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FileValidationError";
  }
}
