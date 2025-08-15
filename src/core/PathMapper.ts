import fsSync from "fs";
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
    if (!input.startsWith("/") && !input.startsWith("./")) {
      return `./${input}`;
    }
    return input;
  }

  map(path: string): string {
    for (const mapping of this.mappings) {
      if (path.startsWith(mapping.from)) {
        return this.makeRelative(path.replace(mapping.from, mapping.to));
      }
    }

    return this.makeRelative(path);
  }
}
