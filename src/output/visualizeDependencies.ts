import path from "path";
import fs from "fs/promises";

type FileEntry = {
  path: string;
  description?: string;
};

type ExecutableFileEntry = FileEntry & {
  pwd: string;
  args: string[];
  fileType?: string | undefined;
};

type FileError = {
  path: string;
  pwd: string;
  error: string;
};

// Matches your AnalysisResult + binaryFiles
export type AnalysisResult = {
  errors: FileError[];
  readFiles: FileEntry[];
  writeFiles: FileEntry[];
  executeFiles: ExecutableFileEntry[];
};

function indent(level: number): string {
  return "  ".repeat(level);
}

function renderTree(
  files: FileEntry[] | ExecutableFileEntry[] | FileError[],
  level: number = 0
): string {
  return [...files]
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((file) => {
      let line = `${indent(level)}- **${file.path}**`;

      if ("fileType" in file && file.fileType) {
        line += ` (${file.fileType})`;
      }
      if ("description" in file && file.description) {
        line += ` — ${file.description}`;
      } else if ("error" in file && file.error) {
        line += ` — ${file.error}`;
      }
      if ("args" in file && file.args.length > 0) {
        line += ` (args: ${file.args.join(" ")})`;
      }
      return line;
    })
    .join("\n");
}

export function toMarkdown(
  result: AnalysisResult,
  headingLevel: number = 2
): string {
  const sections: string[] = [];

  const headingPrefix = [...new Array(headingLevel)].map((_) => "#").join("");

  if (result.readFiles.length > 0) {
    sections.push(
      `${headingPrefix} Read Files\n` + renderTree(result.readFiles, 0)
    );
  }

  if (result.writeFiles.length > 0) {
    sections.push(
      `${headingPrefix} Written Files\n` + renderTree(result.writeFiles, 0)
    );
  }

  const executables = result.executeFiles.filter((f) => !f.fileType);
  if (executables.length > 0) {
    sections.push(
      `${headingPrefix} Executables\n` + renderTree(executables, 0)
    );
  }

  const binaries = result.executeFiles.filter((f) => !!f.fileType);
  if (binaries.length > 0) {
    sections.push(`${headingPrefix} Binaries\n` + renderTree(binaries, 0));
  }

  if (result.errors.length > 0) {
    sections.push(`${headingPrefix} Errors\n` + renderTree(result.errors, 0));
  }

  return sections.join("\n\n");
}

//////////////////////////
// TREE VISUALIZER
//////////////////////////

export type FileAction = "read" | "write" | "execute";

export type FileDependency = {
  path: string;
  fileType?: string | undefined;
  action: FileAction;
};

/**
 * Visualizes a file dependency graph in markdown tree format
 * @param fileDependencies - Map of file paths to their dependencies
 * @param selectedPaths - Optional array of paths to display at top level (if not provided, shows all)
 * @returns Markdown string representation of the dependency tree
 */
export function visualizeDependencyGraph(
  fileDependencies: Map<string, FileDependency[]>,
  selectedPaths?: string[]
): string {
  const lines: string[] = [];
  const visited = new Set<string>();

  function getIcon(action: FileAction, fileType?: string | undefined): string {
    if (action === "read") {
      return "[R]";
    } else if (action === "write") {
      return "[W]";
    } else if (!!fileType) {
      return "[B]";
    }
    return "[E]";
  }

  /**
   * Recursively builds the tree representation
   * @param path - Current file path to process
   * @param indent - Current indentation level
   * @param prefix - Prefix for tree branches
   * @param isLast - Whether this is the last item at current level
   * @param ancestorPaths - Set of ancestor paths to detect circular dependencies
   */
  function buildTree(
    path: string,
    action: FileAction,
    fileType?: string | undefined,
    indent: number = 0,
    prefix: string = "",
    isLast: boolean = true,
    ancestorPaths: Set<string> = new Set()
  ): void {
    const entry = `${prefix}${getIcon(action, fileType)} ${path}`;
    // Check for circular dependency
    if (ancestorPaths.has(path)) {
      lines.push(`${entry} [CIRCULAR]`);
      return;
    }

    // Add current path to output
    if (indent === 0) {
      lines.push(`${getIcon(action, fileType)} ${path}`);
    } else {
      lines.push(`${entry}`);
    }

    // Get dependencies for current path
    const deps = fileDependencies.get(path);
    if (!deps || deps.length === 0) {
      return;
    }

    // Create new ancestor set including current path
    const newAncestorPaths = new Set(ancestorPaths);
    newAncestorPaths.add(path);

    // Process each dependency
    const depsClone = [...deps];
    depsClone.sort((a, b) => a.path.localeCompare(b.path));
    depsClone.forEach((dep, index) => {
      const isLastDep = index === depsClone.length - 1;
      let newPrefix = "";

      if (indent === 0) {
        newPrefix = "|__ ";
      } else {
        // Build the prefix with proper tree characters
        const parentPrefix = prefix.slice(0, -4); // Remove the last branch characters
        if (parentPrefix.endsWith("|__ ")) {
          newPrefix =
            parentPrefix.replace(/\|__ $/, "    ") +
            (isLastDep ? "|__ " : "|__ ");
        } else {
          newPrefix = parentPrefix + "    " + (isLastDep ? "|__ " : "|__ ");
        }
      }

      buildTree(
        dep.path,
        dep.action,
        dep.fileType,
        indent + 1,
        newPrefix,
        isLastDep,
        newAncestorPaths
      );
    });
  }

  // Determine which paths to show at top level
  const topLevelPaths = [
    ...(selectedPaths || Array.from(fileDependencies.keys())),
  ];
  topLevelPaths.sort((a, b) => a.localeCompare(b));

  // Build tree for each top-level path
  topLevelPaths.forEach((path, index) => {
    if (fileDependencies.has(path)) {
      buildTree(path, "execute", undefined);
      // Add empty line between top-level entries (except after the last one)
      if (index < topLevelPaths.length - 1) {
        lines.push("");
      }
    }
  });

  return lines.join("\n");
}

//////////////////////////
// Write to output file
//////////////////////////

function getCurrentDateTimeString(): string {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");

  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

export const writeOutputFile = async (options: {
  analysisResult: AnalysisResult;
  dependencies: Map<string, FileDependency[]>;
  outDir: string;
  entryPoints: string[];
}) => {
  const dateString = getCurrentDateTimeString();
  const outFile = path.resolve(options.outDir, `analysis-${dateString}.md`);

  const content = [
    "# Analysis Result",
    "",
    "## Overview",
    toMarkdown(options.analysisResult, 3),
    "",
    "## Dependency Graph",
    visualizeDependencyGraph(options.dependencies, options.entryPoints),
  ].join("\n");

  await fs.writeFile(outFile, content);

  return content;
};

//////////////////////////
// CREDENTIALS REPORT
//////////////////////////

export interface CredentialEntry {
  filePath: string;
  value: string;
  description?: string;
}

export interface CredentialError {
  filePath: string;
  error: string;
}

export interface CredentialsScanResult {
  credentials: CredentialEntry[];
  errors: CredentialError[];
  stats: {
    filesScanned: number;
    credentialsFound: number;
    errors: number;
  };
}

export const writeCredentialsReport = async (
  result: CredentialsScanResult,
  outDir: string
): Promise<string> => {
  const dateString = getCurrentDateTimeString();
  const outFile = path.resolve(outDir, `credentials-${dateString}.md`);

  const sections: string[] = [
    "# Credentials Analysis Report",
    "",
    "## Summary",
    `- **Files scanned**: ${result.stats.filesScanned}`,
    `- **Credentials found**: ${result.stats.credentialsFound}`,
    `- **Errors**: ${result.stats.errors}`,
    ""
  ];

  if (result.credentials.length > 0) {
    sections.push("## Credentials Found", "");
    
    // Group credentials by file
    const credentialsByFile = new Map<string, CredentialEntry[]>();
    for (const credential of result.credentials) {
      const existing = credentialsByFile.get(credential.filePath) || [];
      existing.push(credential);
      credentialsByFile.set(credential.filePath, existing);
    }

    // Sort files alphabetically
    const sortedFiles = Array.from(credentialsByFile.keys()).sort();
    
    for (const filePath of sortedFiles) {
      const credentials = credentialsByFile.get(filePath)!;
      sections.push(`### ${filePath}`, "");
      
      for (const credential of credentials) {
        sections.push(`- **Value**: \`${credential.value}\``);
        if (credential.description) {
          sections.push(`  - **Description**: ${credential.description}`);
        }
        sections.push("");
      }
    }
  }

  if (result.errors.length > 0) {
    sections.push("## Errors", "");
    
    for (const error of result.errors.sort((a, b) => a.filePath.localeCompare(b.filePath))) {
      sections.push(`- **${error.filePath}**: ${error.error}`);
    }
    sections.push("");
  }

  const content = sections.join("\n");
  await fs.writeFile(outFile, content);

  return content;
};
