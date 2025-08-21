import { readdir, stat } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import chalk from "chalk";
import { CredentialsAnalysisAgent, CredentialsAnalysisResult } from "../agents/credentialsAnalysisAgent";
import { isBinaryFile } from "isbinaryfile";

export interface CredentialsScanStats {
  filesScanned: number;
  credentialsFound: number;
  errors: number;
}

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
  stats: CredentialsScanStats;
}

export interface CredentialsScanOptions {
  dryRun?: boolean;
  verbose?: boolean;
}

export class CredentialsScanService {
  private agent: CredentialsAnalysisAgent;
  
  constructor() {
    // Initialize with empty path mappings since we don't need config
    this.agent = new CredentialsAnalysisAgent([]);
  }
  
  async scanPath(
    inputPath: string,
    options: CredentialsScanOptions = {}
  ): Promise<CredentialsScanResult> {
    const result: CredentialsScanResult = {
      credentials: [],
      errors: [],
      stats: {
        filesScanned: 0,
        credentialsFound: 0,
        errors: 0
      }
    };
    
    // Check if input path exists
    if (!existsSync(inputPath)) {
      throw new Error(`Input path not found: ${inputPath}`);
    }
    
    const inputStat = await stat(inputPath);
    
    if (inputStat.isFile()) {
      console.log(chalk.blue(`🔍 Scanning file: ${inputPath}`));
      await this.scanFile(inputPath, result, options);
    } else if (inputStat.isDirectory()) {
      console.log(chalk.blue(`🔍 Scanning directory: ${inputPath}`));
      const files = await this.getAllFiles(inputPath);
      console.log(chalk.blue(`📁 Found ${files.length} files to scan\n`));
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (options.verbose) {
          console.log(chalk.gray(`> Scanning ${i + 1}/${files.length}: ${file}`));
        }
        await this.scanFile(file, result, options);
      }
    } else {
      throw new Error(`Input path is neither a file nor directory: ${inputPath}`);
    }
    
    return result;
  }
  
  private async scanFile(
    filePath: string,
    result: CredentialsScanResult,
    options: CredentialsScanOptions
  ): Promise<void> {
    try {
      // Skip binary files
      const isBinary = await isBinaryFile(filePath);
      if (isBinary) {
        if (options.verbose) {
          console.log(chalk.yellow(`📀 Skipping binary file: ${filePath}`));
        }
        return;
      }
      
      result.stats.filesScanned++;
      
      const analysisResult = await this.agent.analyzeFile({
        pwd: path.dirname(filePath),
        filePath: path.basename(filePath),
      });
      
      if (analysisResult) {
        if (analysisResult.__type === "success") {
          const credentials = analysisResult.value.credentials;
          for (const credential of credentials) {
            result.credentials.push({
              filePath,
              value: credential.value,
              description: credential.description
            });
            result.stats.credentialsFound++;
          }
          
          if (credentials.length > 0 && options.verbose) {
            console.log(chalk.green(`✅ Found ${credentials.length} credentials in: ${filePath}`));
          }
        } else {
          result.errors.push({
            filePath,
            error: analysisResult.error
          });
          result.stats.errors++;
          
          if (options.verbose) {
            console.log(chalk.red(`❌ Error analyzing ${filePath}: ${analysisResult.error}`));
          }
        }
      }
    } catch (error) {
      result.errors.push({
        filePath,
        error: error instanceof Error ? error.message : String(error)
      });
      result.stats.errors++;
      
      if (options.verbose) {
        console.log(chalk.red(`❌ Error processing ${filePath}: ${error instanceof Error ? error.message : String(error)}`));
      }
    }
  }
  
  private async getAllFiles(dirPath: string): Promise<string[]> {
    const files: string[] = [];
    
    const processDirectory = async (currentPath: string): Promise<void> => {
      const entries = await readdir(currentPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);
        
        if (entry.isDirectory()) {
          await processDirectory(fullPath);
        } else if (entry.isFile()) {
          files.push(fullPath);
        }
      }
    };
    
    await processDirectory(dirPath);
    return files;
  }
  
  printStats(result: CredentialsScanResult, options: { dryRun?: boolean } = {}): void {
    console.log(chalk.bold.cyan("\n📊 Scan Results:"));
    console.log(chalk.blue(`📄 Files scanned: ${result.stats.filesScanned}`));
    console.log(chalk.green(`🔑 Credentials found: ${result.stats.credentialsFound}`));
    console.log(chalk.red(`❌ Errors: ${result.stats.errors}`));
    
    if (result.credentials.length > 0) {
      console.log(chalk.yellow("\n⚠️  Potential credentials found! Review the output file for details."));
    }
  }
}