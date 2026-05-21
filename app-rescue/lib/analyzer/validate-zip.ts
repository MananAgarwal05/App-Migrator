import AdmZip from "adm-zip";

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB
const MAX_UNCOMPRESSED_SIZE = 2 * 1024 * 1024 * 1024; // 2 GB
const MAX_COMPRESSION_RATIO = 100;
const MAX_FILE_COUNT = 50000;

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validateZip(buffer: Buffer): ValidationResult {
  // Check compressed size
  if (buffer.length > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File exceeds maximum size of 500 MB (got ${Math.round(buffer.length / 1024 / 1024)} MB)`,
    };
  }

  let zip: AdmZip;
  try {
    zip = new AdmZip(buffer);
  } catch {
    return { valid: false, error: "Invalid or corrupt ZIP file" };
  }

  const entries = zip.getEntries();

  if (entries.length > MAX_FILE_COUNT) {
    return {
      valid: false,
      error: `ZIP contains too many files (${entries.length} > ${MAX_FILE_COUNT} limit)`,
    };
  }

  let totalUncompressedSize = 0;

  for (const entry of entries) {
    const entryName = entry.entryName;

    // Path traversal check
    if (entryName.includes("..") || entryName.startsWith("/") || entryName.startsWith("\\")) {
      return {
        valid: false,
        error: `Path traversal detected in entry: ${entryName}`,
      };
    }

    // Reject nested ZIPs
    if (!entry.isDirectory && (entryName.endsWith(".zip") || entryName.endsWith(".ZIP"))) {
      return {
        valid: false,
        error: `Nested ZIP files are not allowed: ${entryName}`,
      };
    }

    totalUncompressedSize += entry.header.size;

    // Check uncompressed total size
    if (totalUncompressedSize > MAX_UNCOMPRESSED_SIZE) {
      return {
        valid: false,
        error: `Uncompressed size exceeds 2 GB limit`,
      };
    }
  }

  // Check compression ratio (zip bomb detection)
  if (buffer.length > 0 && totalUncompressedSize / buffer.length > MAX_COMPRESSION_RATIO) {
    return {
      valid: false,
      error: `Suspicious compression ratio (${Math.round(totalUncompressedSize / buffer.length)}:1 exceeds 100:1 limit). Possible zip bomb.`,
    };
  }

  return { valid: true };
}
