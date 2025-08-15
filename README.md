# Repository Dependency Analyzer

An AI-powered tool that analyzes code repositories to discover and visualize file dependencies. It uses AWS Bedrock with Claude to intelligently parse scripts and identify file operations, building a comprehensive dependency graph.

## Features

- **AI-Powered Analysis**: Uses Claude via AWS Bedrock to understand complex script dependencies
- **Smart Path Mapping**: Maps absolute paths from production systems to local relative paths
- **Recursive Analysis**: Automatically follows execution chains to discover transitive dependencies
- **External Dependency Support**: Handles scripts that require configuration files or arguments
- **Unresolvable Path Detection**: Flags paths containing environment variables or dynamic content
- **State Persistence**: Save and resume analysis for large repositories
- **Multiple Output Formats**: GraphViz DOT, Mermaid, JSON, CSV
- **Visualization**: Generate dependency graphs for visual analysis

## Installation

```bash
npm install
npm run build
```

## Configuration

### AWS Credentials

Set up AWS credentials for Bedrock access:

```bash
export AWS_ACCESS_KEY_ID=your_access_key
export AWS_SECRET_ACCESS_KEY=your_secret_key
export AWS_REGION=eu-central-1
```

### Path Mappings

Edit `config.json` to map production paths to local paths:

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

## Usage

### Basic Analysis

```bash
# Pass an entrypoint explicitly (overrides config.json)
npm run analyze -- -e ./crontab

# Pass an output directory (overrides config.json)
npm run analyze -- -o ./out
```

### With Custom Configuration

```bash
npm run analyze -- -c ./my-config.json
```

## How It Works

1. **Entry Point**: Starts with one or multiple entry point files
2. **AI Analysis**: Uses Claude to identify file operations in the code
3. **Path Resolution**: Maps production paths to local filesystem
4. **Recursive Processing**: Queues executable files for further analysis
5. **Graph Building**: Constructs a dependency graph with all relationships

## Example

Given a crontab entry:
```
0 * * * * /opt/application/process.pl -c /var/data/config.ini
```

The analyzer will:
1. Map `/opt/application/process.pl` to `./app/process.pl`
2. Load `./data/config.ini` as context for analysis
3. Identify all files that `process.pl` reads, writes, or executes
4. Recursively analyze any executed scripts
5. Build a complete dependency graph

## Development

```bash
# Run in development mode
npm run dev -- analyze -e ./test/crontab

# Build TypeScript
npm run build

# Run compiled version
npm start -- analyze -e ./test/crontab
```
