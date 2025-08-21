import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { generateObject } from "ai";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import { PathMapper, PathMapping, resolveUnixPath } from "../core";

// Schema for the final analysis result
const CredentialsAnalysisResultSchema = z.object({
  credentials: z
    .array(
      z.object({
        value: z
          .string()
          .describe(
            "The line from the file that reads or write the credentials or secret value."
          ),
        description: z
          .string()
          .optional()
          .describe("What the credentials or secrets are used for."),
      })
    )
    .describe(
      "A list of credentials that are being used or written by the current file."
    ),
});

export type CredentialsAnalysisError = {
  __type: "error";
  error: string;
};

export type CredentialsAnalysisSuccess = {
  __type: "success";
  value: z.infer<typeof CredentialsAnalysisResultSchema>;
};

export type CredentialsAnalysisResult =
  | CredentialsAnalysisError
  | CredentialsAnalysisSuccess;

export class CredentialsAnalysisAgent {
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
  }): Promise<CredentialsAnalysisResult | undefined> {
    const { pwd, filePath } = params;

    const pathMapper = new PathMapper(this.pathMapping);
    const absolutePath = resolveUnixPath(pwd, filePath);
    const mappedResult = pathMapper.map(absolutePath);
    // Only resolve if the mapped path is relative
    const mappedPath = path.isAbsolute(mappedResult)
      ? mappedResult
      : path.resolve(mappedResult);

    console.log(`🔎 Searching ${filePath} for credentials...`);

    // Read the main file content first
    let fileContent: string;
    try {
      fileContent = await fs.readFile(mappedPath, "utf8");
    } catch (error) {
      return { __type: "error" as const, error: (error as Error).message };
    }

    // Generate analysis with tool support
    const result = await generateObject({
      model: this.model,
      schema: CredentialsAnalysisResultSchema,
      system: this.getSystemPrompt(),
      temperature: 0.0,
      prompt: this.buildPrompt({
        fileContent,
      }),
    });
    return {
      __type: "success" as const,
      value: result.object,
    };
  }

  private getSystemPrompt(): string {
    return `You are an experienced security expert, specialized in analyzing code and finding secrets, credentials or other sensitive data.

Your task is to analyze the file you're given and identify any sensitive informatino, like possible credentials or secrets. If you're not
sure if something is sensitive or not, DO include it.

Sensitive information could be any of the following (and potentially more):
- passwords
- api keys
- secrets
- other credentials
- personal information

Include each potentially sensitive data point that you find in your response. If the file doesn't contain any sensitive information, return an empty array.`;
  }

  private buildPrompt(params: { fileContent: string }): string {
    return `Analyze this file and identify any sensitive information that the file contains.

Main File Content:
\`\`\`
${params.fileContent}
\`\`\``;
  }
}
