/**
 * Unit tests for the file upload validation (magic-byte check).
 *
 * We construct minimal valid files from their magic bytes to test the
 * positive path, and craft mismatched files to test the negative path.
 */
import { describe, expect, it } from "vitest";

import {
  validateUpload,
  FileValidationError,
} from "@/lib/security/file-validation";

// Minimal magic bytes for PDF, JPEG, PNG
const PDF_MAGIC = Buffer.from("%PDF-1.4\n", "utf8");
// Minimal JFIF header: SOI + APP0 marker with JFIF identifier
const JPEG_MAGIC = Buffer.from([
  0xff, 0xd8,                   // SOI
  0xff, 0xe0,                   // APP0 marker
  0x00, 0x10,                   // length 16
  0x4a, 0x46, 0x49, 0x46, 0x00, // "JFIF\0"
  0x01, 0x01,                   // version 1.1
  0x00,                         // aspect ratio units
  0x00, 0x01, 0x00, 0x01,       // pixel density
  0x00, 0x00,                   // no thumbnail
]);
// Minimal PNG: 8-byte signature + IHDR chunk (1x1 pixel, 8-bit RGB)
const PNG_MAGIC = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
  0x00, 0x00, 0x00, 0x0d, // IHDR length = 13
  0x49, 0x48, 0x44, 0x52, // "IHDR"
  0x00, 0x00, 0x00, 0x01, // width = 1
  0x00, 0x00, 0x00, 0x01, // height = 1
  0x08, 0x02,             // bit depth 8, colour type RGB
  0x00, 0x00, 0x00,       // compression, filter, interlace
  0x90, 0x77, 0x53, 0xde, // IHDR CRC
]);
const EXE_MAGIC = Buffer.from([0x4d, 0x5a]); // MZ header

function makeFile(name: string, content: Buffer): File {
  return new File([new Uint8Array(content)], name, { type: "application/octet-stream" });
}

describe("validateUpload", () => {
  it("accepts a valid PDF", async () => {
    const result = await validateUpload(makeFile("invoice.pdf", PDF_MAGIC));
    expect(result.mime).toBe("application/pdf");
    expect(result.extension).toBe(".pdf");
  });

  it("accepts a valid JPEG", async () => {
    // JPEG needs a longer header to be detected — pad with zeros
    const content = Buffer.concat([JPEG_MAGIC, Buffer.alloc(100)]);
    const result = await validateUpload(makeFile("photo.jpg", content));
    expect(result.mime).toBe("image/jpeg");
    expect(result.extension).toBe(".jpg");
  });

  it("accepts a valid PNG", async () => {
    const content = Buffer.concat([PNG_MAGIC, Buffer.alloc(100)]);
    const result = await validateUpload(makeFile("photo.png", content));
    expect(result.mime).toBe("image/png");
    expect(result.extension).toBe(".png");
  });

  it("rejects .exe renamed to .pdf (magic-byte check)", async () => {
    const exeAsPdf = makeFile("malware.pdf", EXE_MAGIC);
    await expect(validateUpload(exeAsPdf)).rejects.toBeInstanceOf(FileValidationError);
  });

  it("rejects .exe with its real extension", async () => {
    const exe = makeFile("program.exe", EXE_MAGIC);
    await expect(validateUpload(exe)).rejects.toBeInstanceOf(FileValidationError);
  });

  it("rejects files larger than 10 MB", async () => {
    const big = Buffer.concat([PDF_MAGIC, Buffer.alloc(11 * 1024 * 1024)]);
    const file = makeFile("huge.pdf", big);
    await expect(validateUpload(file)).rejects.toThrow(/too large/i);
  });

  it("rejects empty files", async () => {
    const empty = makeFile("empty.pdf", Buffer.alloc(0));
    await expect(validateUpload(empty)).rejects.toThrow(/empty/i);
  });

  it("rejects extension/content mismatch (PDF content with .png extension)", async () => {
    const file = makeFile("sneaky.png", PDF_MAGIC);
    await expect(validateUpload(file)).rejects.toThrow(/doesn't match/i);
  });

  it("rejects unknown extensions even with valid content", async () => {
    const file = makeFile("invoice.docx", PDF_MAGIC);
    await expect(validateUpload(file)).rejects.toThrow(/not allowed/i);
  });
});
