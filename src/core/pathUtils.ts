import path from "path";

/**
 * Converts any path to Unix-style format.
 * - Converts backslashes to forward slashes
 * - Removes Windows drive letters (C:, D:, etc.)
 * - Ensures the path starts with /
 * 
 * @param inputPath - Path in any format (Windows or Unix)
 * @returns Unix-style path (e.g., /path/to/file)
 */
export function toUnixPath(inputPath: string): string {
  if (!inputPath) {
    return "/";
  }

  // Convert backslashes to forward slashes
  let normalized = inputPath.replace(/\\/g, "/");

  // Convert Windows drive letter to Unix format (e.g., C: → /c)
  if (/^[A-Za-z]:/.test(normalized)) {
    const drive = normalized[0].toLowerCase();
    const rest = normalized.substring(2);
    normalized = "/" + drive + rest;
  }
  
  // Handle relative paths starting with ./
  else if (normalized.startsWith("./")) {
    normalized = normalized.substring(1);
    // Ensure the path starts with /
    if (!normalized.startsWith("/")) {
      normalized = "/" + normalized;
    }
  }
  
  // Ensure other paths start with /
  else if (!normalized.startsWith("/")) {
    normalized = "/" + normalized;
  }

  // Remove any duplicate slashes
  normalized = normalized.replace(/\/+/g, "/");

  // Preserve trailing slash if the input had one, but not for root
  const hadTrailingSlash = inputPath.endsWith("/") || inputPath.endsWith("\\");
  if (normalized.length > 1 && normalized.endsWith("/") && !hadTrailingSlash) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
}

/**
 * Converts a Unix-style path to the current platform's format.
 * - On Unix systems: returns as-is
 * - On Windows: converts to Windows format with backslashes
 * 
 * @param unixPath - Unix-style path (e.g., /path/to/file or /c/path/to/file)
 * @returns Platform-specific path
 */
export function fromUnixPath(unixPath: string): string {
  if (!unixPath) {
    return ".";
  }

  // On Unix systems, return as-is
  if (process.platform !== "win32") {
    return unixPath;
  }

  // On Windows, convert to Windows format
  // If the path is already a Windows absolute path, return as-is
  if (/^[A-Za-z]:/.test(unixPath) || unixPath.startsWith("\\\\")) {
    return unixPath;
  }

  // Check if this is a Unix-style path with a drive letter (/c/Users/...)
  if (/^\/[a-z]\//.test(unixPath)) {
    const drive = unixPath[1].toUpperCase();
    const rest = unixPath.substring(2);
    return drive + ":" + rest.replace(/\//g, "\\");
  }

  // Convert Unix path to Windows format
  // Replace forward slashes with backslashes
  let windowsPath = unixPath.replace(/\//g, path.sep);

  // If it's an absolute Unix path without a drive, keep as relative
  // (we don't know which drive to use)
  if (windowsPath.startsWith("\\")) {
    // Remove leading backslash to make it relative
    windowsPath = "." + windowsPath;
  }

  return windowsPath;
}

/**
 * Checks if a path is in Unix style.
 * 
 * @param inputPath - Path to check
 * @returns true if the path is Unix-style
 */
export function isUnixPath(inputPath: string): boolean {
  // Unix paths start with / and don't contain backslashes or drive letters
  return inputPath.startsWith("/") && 
         !inputPath.includes("\\") && 
         !/^[A-Za-z]:/.test(inputPath);
}

/**
 * Checks if a path is a Windows path.
 * 
 * @param inputPath - Path to check
 * @returns true if the path is Windows-style
 */
export function isWindowsPath(inputPath: string): boolean {
  // Windows paths have drive letters or backslashes or UNC paths
  return /^[A-Za-z]:/.test(inputPath) || 
         inputPath.includes("\\") ||
         inputPath.startsWith("\\\\");
}

/**
 * Resolves paths using Unix-style path resolution, regardless of the current platform.
 * Use this for remote Unix paths that should not be converted to Windows paths.
 * 
 * @param segments - Path segments to resolve
 * @returns Resolved Unix-style path
 */
export function resolveUnixPath(...segments: string[]): string {
  // Use path.posix to ensure Unix-style resolution on all platforms
  return path.posix.resolve(...segments);
}