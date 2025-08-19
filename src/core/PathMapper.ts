import fsSync from "fs";
import path from "path";
import { Config, PathMapping } from "./types";

export class PathMapper {
  constructor(private mappings: PathMapping[]) {}

  static fromConfig(): PathMapper {
    const config: Config = JSON.parse(
      fsSync.readFileSync("config.json", "utf-8")
    );
    return new PathMapper(config.pathMappings);
  }

  private makeRelative(input: string): string {
    // Check if the path is absolute on any platform
    if (path.isAbsolute(input)) {
      // Don't make absolute paths relative
      return input;
    }
    
    // For relative paths, ensure they start with ./
    if (!input.startsWith("./") && !input.startsWith("../")) {
      return `./${input}`;
    }
    return input;
  }

  /**
   * Normalize path separators to forward slashes for comparison
   */
  private normalizePath(inputPath: string): string {
    return inputPath.replace(/\\/g, '/');
  }

  /**
   * Check if a path is a Windows absolute path
   */
  private isWindowsAbsolute(inputPath: string): boolean {
    // Check for drive letter (C:\) or UNC path (\\server\share)
    return /^[a-zA-Z]:[\\\/]/.test(inputPath) || /^\\\\/.test(inputPath);
  }

  map(inputPath: string): string {
    // Normalize the input path for comparison
    const normalizedInput = this.normalizePath(inputPath);
    
    for (const mapping of this.mappings) {
      // Normalize the mapping paths for comparison
      const normalizedFrom = this.normalizePath(mapping.from);
      const normalizedTo = this.normalizePath(mapping.to);
      
      // Check if the path starts with the mapping and is followed by a separator or end of string
      if (normalizedInput === normalizedFrom || 
          normalizedInput.startsWith(normalizedFrom + '/')) {
        // Calculate the relative part after the mapping
        const relativePart = normalizedInput.slice(normalizedFrom.length);
        
        // Combine with the target path
        const mappedPath = normalizedTo + relativePart;
        
        // Convert back to platform-specific separators
        const platformPath = mappedPath.split('/').join(path.sep);
        
        return platformPath;
      }
    }

    // No mapping found
    // For Unix absolute paths that weren't mapped, return as-is (they're production paths)
    if (inputPath.startsWith('/')) {
      return inputPath;
    }
    
    // For Windows absolute paths that weren't mapped, return as-is
    if (this.isWindowsAbsolute(inputPath) || path.isAbsolute(inputPath)) {
      return inputPath;
    }
    
    // For relative paths, ensure they start with ./ or ../
    return this.makeRelative(inputPath);
  }
}
