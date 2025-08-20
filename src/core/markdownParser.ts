import { readFile } from "fs/promises";
import { extname } from "path";

export interface ExtractOptions {
  includeReadFiles?: boolean;
  includeWriteFiles?: boolean;
  includeExecutables?: boolean;
  includeBinaries?: boolean;
  excludeErrors?: boolean;
}

export const DEFAULT_EXTRACT_OPTIONS: ExtractOptions = {
  includeReadFiles: true,
  includeWriteFiles: true,
  includeExecutables: true,
  includeBinaries: true,
  excludeErrors: true,
};

type SectionType = "read" | "write" | "executable" | "binary" | "error" | null;

export function parseFilePathFromLine(line: string): string | null {
  // Match markdown list items with bold file paths
  const match = line.match(/^\s*-\s*\*\*([^*]+)\*\*/);
  if (match) {
    return match[1].trim();
  }
  return null;
}

export function isMarkdownFile(filePath: string): boolean {
  return extname(filePath).toLowerCase() === ".md";
}

export function extractFileListFromMarkdown(
  content: string,
  options: ExtractOptions = DEFAULT_EXTRACT_OPTIONS
): string[] {
  const lines = content.split("\n");
  const filePaths: string[] = [];
  let currentSection: SectionType = null;

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Detect section headers
    if (trimmedLine.startsWith("###")) {
      if (trimmedLine.includes("Read Files")) {
        currentSection = "read";
      } else if (trimmedLine.includes("Written Files")) {
        currentSection = "write";
      } else if (trimmedLine.includes("Executables")) {
        currentSection = "executable";
      } else if (trimmedLine.includes("Binaries")) {
        currentSection = "binary";
      } else if (trimmedLine.includes("Errors")) {
        currentSection = "error";
      } else {
        currentSection = null;
      }
      continue;
    }

    // Skip if we're not in a relevant section
    if (!currentSection) continue;

    // Extract file path from the line
    const filePath = parseFilePathFromLine(line);
    if (!filePath) continue;

    // Apply filters based on options
    const shouldInclude =
      (currentSection === "read" && options.includeReadFiles !== false) ||
      (currentSection === "write" && options.includeWriteFiles !== false) ||
      (currentSection === "executable" && options.includeExecutables !== false) ||
      (currentSection === "binary" && options.includeBinaries !== false) ||
      (currentSection === "error" && !options.excludeErrors);

    if (shouldInclude) {
      filePaths.push(filePath);
    }
  }

  // Remove duplicates while preserving order
  return [...new Set(filePaths)];
}

export async function extractFileListFromMarkdownFile(
  filePath: string,
  options: ExtractOptions = DEFAULT_EXTRACT_OPTIONS
): Promise<string[]> {
  const content = await readFile(filePath, "utf-8");
  return extractFileListFromMarkdown(content, options);
}