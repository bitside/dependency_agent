import fsSync from "fs";
import path from "path";
import { Config, PathMapping } from "./types";
import { toUnixPath, isWindowsPath } from "./pathUtils";

export class PathMapper {
  constructor(private mappings: PathMapping[]) {}

  static fromConfig(): PathMapper {
    const config: Config = JSON.parse(
      fsSync.readFileSync("config.json", "utf-8")
    );
    
    // Validate that all path mappings use Unix-style paths
    for (const mapping of config.pathMappings) {
      if (isWindowsPath(mapping.from)) {
        throw new Error(
          `Path mappings must use Unix-style paths. Found Windows-style path in 'from': ${mapping.from}\n` +
          `Please use forward slashes (/) and no drive letters. Example: /autoimg instead of C:\\autoimg`
        );
      }
      // Note: 'to' paths can be Windows paths as they represent local filesystem paths
    }
    
    return new PathMapper(config.pathMappings);
  }


  /**
   * Normalize path separators to forward slashes for comparison
   */
  private normalizePath(inputPath: string): string {
    return inputPath.replace(/\\/g, '/');
  }

  map(inputPath: string): string {
    // Convert input to Unix style for consistent comparison
    const unixInput = toUnixPath(inputPath);
    
    // Try to find a matching mapping
    for (const mapping of this.mappings) {
      // Mapping 'from' should already be Unix style (validated in fromConfig)
      const unixFrom = mapping.from;
      
      // Check if the path matches this mapping
      if (unixInput === unixFrom || 
          unixInput.startsWith(unixFrom + '/')) {
        // Calculate the relative part after the mapping
        const relativePart = unixInput.slice(unixFrom.length);
        
        // The 'to' path might be Windows or Unix style
        
        // Convert to platform-specific format for file system operations
        // If the original 'to' was a Windows path, keep it in Windows format
        if (isWindowsPath(mapping.to)) {
          // Use the original Windows path format with proper separators
          const normalizedTo = this.normalizePath(mapping.to);
          const mappedPath = normalizedTo + relativePart;
          // Ensure we use backslashes for Windows paths
          return mappedPath.replace(/\//g, '\\');
        } else {
          // For Unix-style 'to' paths, check if they should be relative
          let mappedPath = mapping.to + relativePart;
          
          // If the 'to' path starts with ./ or ../, preserve that
          if (mapping.to.startsWith('./') || mapping.to.startsWith('../')) {
            // Already relative, just return with proper separators
            return mappedPath;
          }
          
          // Otherwise return as-is
          return mappedPath;
        }
      }
    }

    // No mapping found - return the original input path
    return inputPath;
  }
}