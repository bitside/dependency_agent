import { readFile, copyFile, mkdir, stat } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import chalk from "chalk";
import { PathMapper, Config, resolveUnixPath, isMarkdownFile, extractFileListFromMarkdownFile, ExtractOptions } from "../core";

export interface CopyStats {
  total: number;
  copied: number;
  skipped: number;
  missing: number;
  errors: number;
}

export interface CopyFileOptions extends ExtractOptions {
  dryRun?: boolean;
  verbose?: boolean;
}

export class FileCopyService {
  private pathMapper: PathMapper;
  private pwd: string;
  
  constructor(config: Config) {
    this.pathMapper = new PathMapper(config.pathMappings);
    this.pwd = config.pwd;
  }
  
  async copyFiles(
    inputPath: string,
    outputDir: string,
    options: CopyFileOptions = {}
  ): Promise<CopyStats> {
    const stats: CopyStats = {
      total: 0,
      copied: 0,
      skipped: 0,
      missing: 0,
      errors: 0
    };
    
    // Check if input file exists
    if (!existsSync(inputPath)) {
      throw new Error(`Input file not found: ${inputPath}`);
    }
    
    // Determine input type and extract file paths
    const filePaths = await this.extractFilePaths(inputPath, options);
    
    stats.total = filePaths.length;
    
    const inputType = this.detectInputType(inputPath);
    const inputDescription = inputType === 'markdown' ? 'analysis file' : 'file list';
    console.log(chalk.blue(`\n📋 Processing ${stats.total} files from ${inputDescription}: ${inputPath}`));
    console.log(chalk.blue(`📁 Output directory: ${outputDir}\n`));
    
    if (options.dryRun) {
      console.log(chalk.yellow("🔍 DRY RUN MODE - No files will be copied\n"));
    }
    
    for (const filePath of filePaths) {
      try {
        await this.processSingleFile(filePath, outputDir, options, stats);
      } catch (error) {
        stats.errors++;
        console.error(chalk.red(`❌ Error processing ${filePath}: ${error instanceof Error ? error.message : String(error)}`));
      }
    }
    
    return stats;
  }
  
  private detectInputType(filePath: string): 'markdown' | 'text' {
    return isMarkdownFile(filePath) ? 'markdown' : 'text';
  }
  
  private async extractFilePaths(inputPath: string, options: CopyFileOptions): Promise<string[]> {
    const inputType = this.detectInputType(inputPath);
    
    if (inputType === 'markdown') {
      // Extract from markdown file
      return await extractFileListFromMarkdownFile(inputPath, options);
    } else {
      // Read text file list
      const listContent = await readFile(inputPath, "utf-8");
      return listContent
        .split("\n")
        .map(line => line.trim())
        .filter(line => line.length > 0);
    }
  }
  
  private async processSingleFile(
    filePath: string,
    outputDir: string,
    options: CopyFileOptions,
    stats: CopyStats
  ): Promise<void> {
    // Resolve absolute path using the configured pwd
    const absolutePath = resolveUnixPath(this.pwd, filePath);
    
    // Map to local filesystem path
    const localPath = this.pathMapper.map(absolutePath);
    
    if (options.verbose) {
      console.log(chalk.gray(`  Mapping: ${absolutePath} → ${localPath}`));
    }
    
    // Check if source file exists
    if (!existsSync(localPath)) {
      stats.missing++;
      console.warn(chalk.yellow(`⚠️  File not found: ${localPath}`));
      return;
    }
    
    // Create destination path maintaining directory structure
    // Use the original absolute path structure for the destination
    const relativePath = absolutePath.startsWith('/') ? absolutePath.substring(1) : absolutePath;
    const destPath = path.join(outputDir, relativePath);
    
    // Check if destination already exists
    if (existsSync(destPath)) {
      // Compare file stats to see if we should skip
      const [sourceStat, destStat] = await Promise.all([
        stat(localPath),
        stat(destPath)
      ]);
      
      if (sourceStat.mtime <= destStat.mtime && sourceStat.size === destStat.size) {
        stats.skipped++;
        if (options.verbose) {
          console.log(chalk.gray(`⏭️  Skipping unchanged: ${destPath}`));
        }
        return;
      }
    }
    
    if (options.dryRun) {
      console.log(chalk.cyan(`📄 Would copy: ${localPath} → ${destPath}`));
      stats.copied++;
      return;
    }
    
    // Create destination directory
    const destDir = path.dirname(destPath);
    await mkdir(destDir, { recursive: true });
    
    // Copy the file
    await copyFile(localPath, destPath);
    stats.copied++;
    
    if (options.verbose) {
      console.log(chalk.green(`✅ Copied: ${path.basename(destPath)}`));
    }
  }
  
  printStats(stats: CopyStats, options: CopyFileOptions = {}): void {
    console.log(chalk.bold.cyan("\n📊 Copy Summary:"));
    console.log(`${chalk.gray("Total files:")} ${stats.total}`);
    console.log(`${chalk.green("✅ Copied:")} ${stats.copied}`);
    console.log(`${chalk.gray("⏭️  Skipped:")} ${stats.skipped}`);
    console.log(`${chalk.yellow("⚠️  Missing:")} ${stats.missing}`);
    console.log(`${chalk.red("❌ Errors:")} ${stats.errors}`);
    
    if (options.dryRun) {
      console.log(chalk.yellow("\n🔍 This was a dry run - no files were actually copied"));
    }
    
    const successRate = stats.total > 0 ? ((stats.copied + stats.skipped) / stats.total * 100).toFixed(1) : "0.0";
    console.log(chalk.blue(`\n📈 Success rate: ${successRate}%\n`));
  }
}

export async function copyFiles(
  inputPath: string,
  config: Config,
  outputDir: string,
  options: CopyFileOptions = {}
): Promise<CopyStats> {
  const service = new FileCopyService(config);
  return await service.copyFiles(inputPath, outputDir, options);
}

// Backward compatibility - keep the old function name
export async function copyFilesFromList(
  listPath: string,
  config: Config,
  outputDir: string,
  options: CopyFileOptions = {}
): Promise<CopyStats> {
  const service = new FileCopyService(config);
  return await service.copyFiles(listPath, outputDir, options);
}