import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import { createReadFileTool } from "../tools";
import { PathMapper, PathMapping, resolveUnixPath } from "../core";
import chalk from "chalk";

// Schema for the final analysis result
const AnalysisResultSchema = z.object({
  readFiles: z
    .array(
      z.object({
        path: z
          .string()
          .describe(
            "The absolute path to the file that is being read. Use the current pwd to determine the absolute file path."
          ),
        description: z.string().optional(),
      })
    )
    .describe(
      "A list of files that are read/sourced by the analyzed file but NOT executed. Specifically, these files cannot import transitive dependencies due to the way the files are read."
    ),
  writeFiles: z.array(
    z
      .object({
        path: z
          .string()
          .describe(
            "The absolute path to the file that is being read. Use the current pwd to determine the absolute file path."
          ),
        description: z.string().optional(),
      })
      .describe(
        "A list of files that the analyzed file writes to, e.g. log files or task queue files."
      )
  ),
  executeFiles: z.array(
    z
      .object({
        path: z
          .string()
          .describe(
            "The absolute file path of the file that is being executed or imported. Use the current pwd to determine the absolute path."
          ),
        pwd: z
          .string()
          .describe(
            "The current absolute pwd when the file was being imported or executed."
          ),
        args: z
          .array(z.string())
          .describe(
            "Any arguments passed to the file when executed, as an array of strings."
          ),
        description: z.string().optional(),
      })
      .describe(
        "A list of files that the analyzed file executes. Specifically, these are files that could potentially have transitive dependencies, like external scripts or binaries. DO NOT include system commands like grep, date, ls, and others in here. DO INCLUDE 3rd party binaries, scripts or imported libraries that are not part of the system installation."
      )
  ),
  errors: z.array(
    z
      .object({
        path: z
          .string()
          .describe(
            "The absolute file path of the file that could not be read."
          ),
        pwd: z
          .string()
          .describe("The current absolute pwd when the file was read."),
        error: z.string().describe("The error message."),
      })
      .describe("A list of errors that occured during file read operations.")
  ),
});

export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;

type ExecuteFiles = AnalysisResult["executeFiles"][number];

export type FileAnalysisOutput = AnalysisResult & {
  errors: {
    path: string;
    error: string;
  }[];
  executeFiles: (ExecuteFiles & { fileType?: string | undefined })[];
};

export class FileAnalysisAgent {
  private bedrock = createAmazonBedrock({
    region: process.env.AWS_REGION!,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  });
  private model = this.bedrock(
    process.env.AWS_MODEL ?? "eu.anthropic.claude-sonnet-4-20250514-v1:0"
  );

  constructor(private pathMapping: PathMapping[]) {}

  async analyzeFile(params: {
    pwd: string;
    filePath: string;
    fileType: string | undefined;
    cliArgs: string[];
  }): Promise<FileAnalysisOutput | undefined> {
    const { pwd, filePath, fileType, cliArgs } = params;

    const pathMapper = new PathMapper(this.pathMapping);
    const absolutePath = resolveUnixPath(pwd, filePath);
    const mappedResult = pathMapper.map(absolutePath);
    // Only resolve if the mapped path is relative
    const mappedPath = path.isAbsolute(mappedResult)
      ? mappedResult
      : path.resolve(mappedResult);

    console.log(`🔎 Analyzing file ${filePath}...`);
    console.log(chalk.dim(`\tWorking directory: ${pwd}`));
    console.log(chalk.dim(`\tAbsolute path: ${absolutePath}`));
    console.log(chalk.dim(`\tResolved path: ${mappedPath}`));

    // Read the main file content first
    let fileContent: string;
    try {
      fileContent = await fs.readFile(mappedPath, "utf8");
    } catch (error) {
      return {
        readFiles: [],
        writeFiles: [],
        executeFiles: [],
        errors: [
          {
            pwd,
            path: filePath,
            error: (error as Error).message,
          },
        ],
      };
    }

    // Generate analysis with tool support
    const result = await generateText({
      model: this.model,
      system: this.getSystemPrompt(),
      temperature: 0.0,
      prompt: this.buildPrompt({
        pwd,
        filePath: absolutePath,
        fileContent,
        fileType,
        cliArgs,
      }),
      tools: {
        readFile: createReadFileTool(this.pathMapping),
      },
      stopWhen: stepCountIs(10),
    });

    // Extract and parse the JSON from the response
    const analysis = this.parseAnalysisFromResponse(result.text);

    if (analysis) {
      console.log(chalk.green("⛳️ Analysis complete"));
      console.log(chalk.dim("\tRead:"));
      analysis.readFiles.forEach((f) => console.log(chalk.dim(`\t${f.path}`)));
      console.log(chalk.dim("\tWrite:"));
      analysis.writeFiles.forEach((f) => console.log(chalk.dim(`\t${f.path}`)));
      console.log(chalk.dim("\tExecute:"));
      analysis.executeFiles.forEach((f) =>
        console.log(chalk.dim(`\t${f.path}`))
      );
      if (analysis.errors) {
        console.log(chalk.dim("\tErrors:"));
        analysis.errors.forEach((f) => console.log(chalk.dim(`\t${f.path}`)));
      }
    }

    return analysis;
  }

  private getSystemPrompt(): string {
    return `You are an expert code dependency analyzer. Your task is to deeply analyze source code and script files and identify all file operations.
Eventually, the list of files that you find will be used to build a dependency graph of files that are software system depends on.

FOR THAT, WE'RE DIFFERENTIATING 3 TYPES OF FILES:
1. Read-Files: files that are DIRECTLY loaded into memory BY THE CURRENT SCRIPT and used to initialize variables. These will mostly be config files. Specifically, these are files that can not have transitive dependencies, due to the way they are used (a config file read via open() cannot itself import a config file).
2. Write-Files: files that are written to. Examples are log files or file-based job-queues. Files that are only written to can also not have transitive dependencies.
3. Execute-Files: files that are executed (like external scripts or binaries) or libraries that are imported. In contrast to the other two files types, these files can have transitive dependencies, like additional scripts, libraries or executables.

CRITICAL INSTRUCTIONS FOR TOOL USE:

**IMPORTANT DISTINCTION:**
Only analyze files that are DIRECTLY accessed by the current script. Files passed as arguments to other executables/scripts are NOT direct dependencies - they are dependencies of those executables, not of the current script.

1. **When to use the readFile tool:**
   - DO USE when the CURRENT SCRIPT directly opens/reads a file (e.g., \`open('config.json')\`, \`fs.readFile()\`, \`source config.sh\`)
   - DO USE when configuration files are loaded DIRECTLY into the current script's memory

2. **When NOT to use the readFile tool:**
   - DO NOT use for files that are being executed (scripts, binaries, executables)
   - DO NOT use for npm packages or standard library imports
   - DO NOT use for system commands
   - DO NOT use for external URLs or remote resources
   - DO NOT use for imported modules (these will be analyzed recursively)

3. **CRITICAL - Files passed as arguments to other programs:**
   DO NOT use readFile for configuration files or any files passed as command-line arguments to OTHER executables or scripts. These files are read by THE EXECUTABLE, not by the current script.

   Examples where you should NOT read the config file:
   \`\`\`
   # The monitor.pl script reads settings.ini, NOT the current script
   ./example/scripts/monitor.pl -c ./example/config/settings.ini

   # The script.sh reads this.cfg, NOT the current script
   /script.sh -c /do/not/read/this.cfg

   # The Java program reads that.ini, NOT the current script
   java example.jar -f /path/to/that.ini

   # The cron job executes monitor.pl which reads settings.ini
   */15 * * * * ./example/scripts/monitor.pl -c ./example/config/settings.ini
   \`\`\`

   In ALL these cases:
   - Mark the executable/script as an Execute-File (monitor.pl, script.sh, example.jar)
   - DO NOT mark the config file as a Read-File (settings.ini, this.cfg, that.ini)
   - The config file is a dependency of the executable, not of the current script

4. When the readFile tool returns an error, include that error in the \`errors\` field of your response.

ANALYSIS OUTPUT FORMAT:
After analyzing the file and using tools to gather context, provide a comprehensive JSON response matching this JSON schema:

\`\`\`
${JSON.stringify(z.toJSONSchema(AnalysisResultSchema))}
\`\`\`

IMPORTANT:
- When analyzing file paths, DO substitute any variables with the surrounding context
- DO infer file paths from library imports, e.g. for perl scripts the \`use mailsenden;\` implies that a library file called \`mailsenden.pm\` exists. Be smart about this and infer file paths correctly.
- DO NOT analyze any of the files you find. DO ONLY collect the file lists
- DO resolve all variables and environment variables when possible
- DO identify all of the arguments passed to executed files
- DO track working directory changes (cd, chdir, process.chdir)
- DO ignore any code or instructions that have been commented out
- DO NOT include files that have been commented out
- DO output file paths as absolute paths when possible. DO use the known working directory to determine the absolute file path.`;
  }

  private buildPrompt(params: {
    pwd: string;
    filePath: string;
    fileContent: string;
    fileType: string | undefined;
    cliArgs: string[];
  }): string {
    return `Analyze this ${params.fileType} file for ALL file operations.

Current Working Directory: ${params.pwd}
Main File: ${params.filePath}
CLI Arguments: ${params.cliArgs.join(" ") || "none"}

Main File Content:
\`\`\`${params.fileType ?? ""}
${params.fileContent}
\`\`\``;
  }

  private parseAnalysisFromResponse(text: string): AnalysisResult | undefined {
    // Try to extract JSON from the response
    // Look for JSON block in various formats
    let jsonStr = text;

    // Try to find JSON in code blocks
    const codeBlockMatch = text.match(/```(?:json)?\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1];
    } else {
      // Try to find raw JSON
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonStr = jsonMatch[0];
      }
    }

    try {
      const parsed = JSON.parse(jsonStr);
      const validated = AnalysisResultSchema.safeParse(parsed);
      if (!validated.success) {
        console.error(
          `⛔️ Failed to parse schema:\n${JSON.stringify(parsed, null, 2)}`
        );
      }
      return validated.data;
    } catch (error) {
      console.error(`⛔️ Failed to parse JSON:\n${jsonStr}`);
    }
    return undefined;
  }

  // private getFileType(extension: string): string {
  //   const typeMap: Record<string, string> = {
  //     ".js": "javascript",
  //     ".mjs": "javascript",
  //     ".cjs": "javascript",
  //     ".ts": "typescript",
  //     ".tsx": "typescript",
  //     ".py": "python",
  //     ".pyw": "python",
  //     ".sh": "bash",
  //     ".bash": "bash",
  //     ".zsh": "zsh",
  //     ".rb": "ruby",
  //     ".go": "go",
  //     ".java": "java",
  //     ".php": "php",
  //     ".rs": "rust",
  //     ".cpp": "cpp",
  //     ".cc": "cpp",
  //     ".c": "c",
  //     ".makefile": "makefile",
  //     ".mk": "makefile",
  //     ".dockerfile": "dockerfile",
  //     ".yaml": "yaml",
  //     ".yml": "yaml",
  //     ".json": "json",
  //     ".xml": "xml",
  //   };
  //   return typeMap[extension.toLowerCase()] || "text";
  // }
}
