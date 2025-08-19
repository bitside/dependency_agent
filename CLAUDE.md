# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Repository Dependency Analyzer - an AI-powered tool that analyzes code repositories to discover and visualize file dependencies using AWS Bedrock with Claude. It recursively analyzes scripts to build comprehensive dependency graphs.

## Architecture

The codebase follows a modular TypeScript architecture:

- **Entry Point**: `src/cli.ts` - Command-line interface using Commander.js
- **Core Agent**: `src/agents/FileAnalysisAgent.ts` - AI-powered analysis using Claude via AWS Bedrock
- **Path Mapping**: `src/core/PathMapper.ts` - Maps production paths to local filesystem
- **Visualization**: `src/output/visualizeDependencies.ts` - Generates dependency graphs in Markdown format
- **Tools**: `src/tools/` - Helper tools for file reading operations

The analysis workflow:
1. Starts with entry point files (e.g., crontab)
2. Uses Claude AI to identify file operations in each script
3. Maps production paths to local paths using configurable mappings
4. Recursively processes executable files
5. Builds and visualizes dependency graphs

## Development Commands

```bash
# Install dependencies
npm install

# Build TypeScript to JavaScript
npm run build

# Development mode - run TypeScript directly
npm run dev -- analyze -e ./test/crontab

# Run example analysis
npm run dev:example

# Production mode - run compiled JavaScript
npm start -- analyze -e ./test/crontab

# Analyze with custom config
npm run analyze -- -c ./my-config.json
```

## Configuration

The project uses a `config.json` file for path mappings and entry points:

```json
{
  "pwd": "/root",
  "entryPoints": [{
    "path": "/var/data/script.sh",
    "pwd": "/root",
    "args": []
  }],
  "pathMappings": [
    { "from": "/opt/application", "to": "./app" },
    { "from": "/var/data", "to": "./data" }
  ],
  "outDir": "./output"
}
```

## Environment Requirements

AWS credentials must be configured for Bedrock access:
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION` (default: eu-central-1)
- `AWS_MODEL` (optional, defaults to Claude Sonnet)

## Key Implementation Details

- The FileAnalysisAgent uses temperature 0.0 for deterministic analysis
- Binary files are automatically detected and skipped using the `file-type` library
- Analysis results include read files, write files, executable files, and errors
- The tool differentiates between files that are read (config), written (logs), and executed (scripts)
- Circular dependencies are detected and marked in the dependency graph
- Output includes both overview statistics and a visual dependency tree