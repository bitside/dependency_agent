export interface PathMapping {
  from: string;
  to: string;
}

export interface Config {
  pathMappings: PathMapping[];
  pwd: string;
  outDir?: string;
  copyOutputDir?: string;
  entryPoints?: {
    pwd: string;
    path: string;
    args: string[];
  }[];
}
