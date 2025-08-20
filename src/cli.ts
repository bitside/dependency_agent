#!/usr/bin/env node

import "dotenv/config";
import { Command } from "commander";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import chalk from "chalk";
import { FileAnalysisAgent, FileAnalysisOutput } from "./agents";
import { fileTypeFromBuffer } from "file-type";
import { PathMapper, Config, resolveUnixPath } from "./core";
import { isBinaryFile } from "isbinaryfile";
import { writeOutputFile } from "./output/visualizeDependencies";
import { type FileDependency } from "./output/visualizeDependencies";
import { FileCopyService } from "./services/copyFiles";

function uniqueBy<T>(array: T[], key: keyof T): T[] {
  const seen = new Set();
  return array.filter((item) => {
    const value = item[key];
    if (seen.has(value)) {
      return false;
    }
    seen.add(value);
    return true;
  });
}

const determineFileType = async (
  fileMapper: PathMapper,
  file: { path: string; pwd: string }
): Promise<string | undefined> => {
  const absolutePath = resolveUnixPath(file.pwd, file.path);
  try {
    const mappedAbsolutePath = fileMapper.map(absolutePath);
    const buffer = await readFile(mappedAbsolutePath);
    const fileType = await fileTypeFromBuffer(buffer);
    if (fileType) {
      return fileType.ext;
    }
    const isBinary = await isBinaryFile(mappedAbsolutePath);
    return isBinary ? "unknown" : undefined;
  } catch (e) {
    console.error(`⛔️ File does not exist: ${absolutePath}`);
    return undefined;
  }
};

const program = new Command();

program
  .name("repo-analyzer")
  .description("Analyze repository dependencies using AI")
  .version("1.0.0");

program
  .command("analyze")
  .description("Analyze dependencies starting from an entry point")
  .option("-e, --entry <path>", "Entry point file (e.g., crontab)")
  .option("-c, --config <path>", "Configuration file path", "./config.json")
  .option("-o, --output <path>", "Output directory for reports", "./output")
  .action(async (options) => {
    try {
      console.log(chalk.bold.cyan("\n🚀 Repository Dependency Analyzer\n"));

      // Load configuration
      if (!existsSync(options.config)) {
        console.error(
          chalk.red(`Configuration file not found: ${options.config}`)
        );
        process.exit(1);
      }

      const config: Config = JSON.parse(
        await readFile(options.config, "utf-8")
      );
      console.log(
        chalk.green(`✅ Configuration loaded from: ${options.config}`)
      );

      // Check AWS credentials
      if (
        !process.env.AWS_REGION ||
        !process.env.AWS_ACCESS_KEY_ID ||
        !process.env.AWS_SECRET_ACCESS_KEY
      ) {
        console.warn(
          chalk.yellow("⚠️  AWS credentials not found in environment variables")
        );
        console.warn(
          chalk.yellow(
            "   Please set AWS_REGION, AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY"
          )
        );
        console.warn(
          chalk.yellow("   Or configure AWS CLI with: aws configure")
        );
      }

      const agent = new FileAnalysisAgent(config.pathMappings);

      const entryPoints = options.entry
        ? [
            {
              pwd: config.pwd,
              path: options.entry as string,
              args: [],
            },
          ]
        : config.entryPoints!;

      const processQueue: {
        pwd: string;
        path: string;
        args: string[];
        description?: string | undefined;
        fileType?: string | undefined;
      }[] = [...entryPoints];

      const fileMapper = new PathMapper(config.pathMappings);

      // TODO:
      // - [x] Allow multiple entry points via config file
      // - [ ] Write output to file
      const MAX_ITERATIONS = 100;
      let currentIteration = 0;
      const output: FileAnalysisOutput = {
        readFiles: [],
        writeFiles: [],
        errors: [],
        executeFiles: [],
      };

      const fileDependencies: Map<string, FileDependency[]> = new Map<
        string,
        FileDependency[]
      >();

      const processedFiles: Set<string> = new Set<string>();

      while (processQueue.length > 0 && currentIteration++ < MAX_ITERATIONS) {
        console.info(
          chalk.gray(
            `> Processing ${currentIteration} / ${
              currentIteration + processQueue.length - 1
            }...`
          )
        );
        const nextFile = processQueue.splice(0, 1)[0];
        const absolutePath = resolveUnixPath(nextFile.pwd, nextFile.path);

        // Skip files that have already been processed.
        if (processedFiles.has(absolutePath)) {
          continue;
        }

        processedFiles.add(absolutePath);

        // Filter binary files and skip their analysis.
        const isBinaryFile = !!nextFile.fileType;
        if (isBinaryFile) {
          const mappedAbsolutePath = fileMapper.map(absolutePath);
          console.log(
            `📀 Skipping binary file ${mappedAbsolutePath} with type ${nextFile.fileType}`
          );
          continue;
        }

        const analysisResult = await agent.analyzeFile({
          pwd: nextFile.pwd,
          filePath: nextFile.path,
          fileType: nextFile.fileType ?? undefined,
          cliArgs: nextFile.args,
        });

        const dependencies: FileDependency[] = [];
        if (analysisResult) {
          output.readFiles.push(...analysisResult.readFiles);
          output.writeFiles.push(...analysisResult.writeFiles);
          const executablesWithType = await Promise.all(
            analysisResult.executeFiles.map(async (file) => {
              const fileType = await determineFileType(fileMapper, file);
              return { ...file, fileType };
            })
          );
          output.executeFiles.push(...executablesWithType);
          output.errors.push(...analysisResult.errors);
          processQueue.push(...executablesWithType);

          dependencies.push(
            ...analysisResult.readFiles.map((f) => ({
              path: f.path,
              action: "read" as const,
            }))
          );
          dependencies.push(
            ...analysisResult.writeFiles.map((f) => ({
              path: f.path,
              action: "write" as const,
            }))
          );
          dependencies.push(
            ...executablesWithType.map((f) => ({
              path: f.path,
              fileType: f.fileType,
              action: "execute" as const,
            }))
          );
        }

        fileDependencies.set(absolutePath, dependencies);
      }

      output.readFiles = uniqueBy(output.readFiles, "path");
      output.writeFiles = uniqueBy(output.writeFiles, "path");
      output.executeFiles = uniqueBy(output.executeFiles, "path");

      const outDir =
        (options.outDir as string | undefined) ?? config.outDir ?? ".";
      const content = await writeOutputFile({
        outDir,
        analysisResult: output,
        dependencies: fileDependencies,
        entryPoints: entryPoints.map((e) => e.path),
      });

      console.log(chalk.green("\n✅ Analysis complete!"));
      console.log("");
      console.log(chalk.blue(content));
    } catch (error) {
      console.error(chalk.red("\n❌ Error:"), error);
      process.exit(1);
    }
  });

program
  .command("copy")
  .description(
    "Copy files from a markdown analysis file or text list to an output directory using path mappings"
  )
  .requiredOption(
    "-i, --input <path>",
    "Path to markdown analysis file or text file with file paths (one per line)"
  )
  .option("-c, --config <path>", "Configuration file path", "./config.json")
  .requiredOption("-o, --output <path>", "Output directory for copied files")
  .option("--dry-run", "Preview what would be copied without copying", false)
  .option("-v, --verbose", "Show detailed output", false)
  .option("--no-read", "Exclude read files (only applies to markdown input)")
  .option("--no-write", "Exclude write files (only applies to markdown input)")
  .option(
    "--no-exec",
    "Exclude executable files (only applies to markdown input)"
  )
  .option(
    "--no-binary",
    "Exclude binary files (only applies to markdown input)"
  )
  .option(
    "--include-errors",
    "Include error files (only applies to markdown input)",
    false
  )
  .action(async (options) => {
    try {
      console.log(chalk.bold.cyan("\n📁 Repository File Copy Tool\n"));

      // Load configuration
      if (!existsSync(options.config)) {
        console.error(
          chalk.red(`Configuration file not found: ${options.config}`)
        );
        process.exit(1);
      }

      const config: Config = JSON.parse(
        await readFile(options.config, "utf-8")
      );
      console.log(
        chalk.green(`✅ Configuration loaded from: ${options.config}`)
      );

      // Check if input file exists
      if (!existsSync(options.input)) {
        console.error(chalk.red(`Input file not found: ${options.input}`));
        process.exit(1);
      }

      const extractOptions = {
        includeReadFiles: options.read !== false,
        includeWriteFiles: options.write !== false,
        includeExecutables: options.exec !== false,
        includeBinaries: options.binary !== false,
        excludeErrors: !options.includeErrors,
      };

      // Create copy service and execute
      const copyService = new FileCopyService(config);
      const stats = await copyService.copyFiles(options.input, options.output, {
        dryRun: options.dryRun,
        verbose: options.verbose,
        ...extractOptions,
      });

      copyService.printStats(stats, { dryRun: options.dryRun });

      if (stats.errors > 0) {
        console.log(
          chalk.yellow(
            "⚠️  Some files could not be copied. Check the errors above."
          )
        );
        process.exit(1);
      }

      console.log(chalk.green("✅ Copy operation completed successfully!"));
    } catch (error) {
      console.error(chalk.red("\n❌ Error:"), error);
      process.exit(1);
    }
  });

// Parse command line arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
