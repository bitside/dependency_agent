import { tool } from "ai";
import { z } from "zod";
import fs from "fs/promises";
import { PathMapper, PathMapping, resolveUnixPath } from "../core";

export const createReadFileTool = (pathMappings: PathMapping[]) => {
  const pathMapper = new PathMapper(pathMappings);
  return tool({
    description: "Read contents of a local file",
    inputSchema: z.object({
      pwd: z.string().optional().describe("The current working directory."),
      filepath: z.string().describe("Path to the file to read"),
      encoding: z.enum(["utf8", "base64"]).optional().default("utf8"),
    }),
    execute: async ({ pwd, filepath, encoding }) => {
      try {
        const mappedPath = pathMapper.map(resolveUnixPath(pwd ?? "", filepath));
        // Resolve the path (you might want to restrict to specific directories)

        console.log(
          `📂 Reading file '${filepath}' from '${mappedPath}' with pwd '${pwd}'.`
        );

        // Read the file
        const content = await fs.readFile(mappedPath, encoding);

        return {
          success: true,
          content,
          filepath: mappedPath,
        };
      } catch (error: unknown) {
        console.error(`⛔️ Failed to read file '${filepath}': ${error}`);
        return {
          success: false,
          error: `${error}`,
          filepath,
        };
      }
    },
  });
};
