import { PathMapper } from "./PathMapper";
import { toUnixPath, fromUnixPath, isWindowsPath, isUnixPath } from "./pathUtils";
import path from "path";

describe("PathUtils", () => {
  describe("toUnixPath", () => {
    test("converts Windows paths to Unix style preserving drive letters", () => {
      expect(toUnixPath("C:\\autoimg\\paisy\\skript")).toBe("/c/autoimg/paisy/skript");
      expect(toUnixPath("C:/autoimg/paisy/skript")).toBe("/c/autoimg/paisy/skript");
      expect(toUnixPath("D:\\Data\\file.txt")).toBe("/d/Data/file.txt");
    });

    test("preserves Unix paths", () => {
      expect(toUnixPath("/autoimg/paisy/skript")).toBe("/autoimg/paisy/skript");
      expect(toUnixPath("/opt/application")).toBe("/opt/application");
    });

    test("handles relative paths", () => {
      expect(toUnixPath("./relative/path")).toBe("/relative/path");
      expect(toUnixPath("relative/path")).toBe("/relative/path");
    });

    test("handles edge cases", () => {
      expect(toUnixPath("")).toBe("/");
      expect(toUnixPath("/")).toBe("/");
      expect(toUnixPath("C:")).toBe("/c");
    });
  });

  describe("isWindowsPath and isUnixPath", () => {
    test("correctly identifies Windows paths", () => {
      expect(isWindowsPath("C:\\path")).toBe(true);
      expect(isWindowsPath("D:/path")).toBe(true);
      expect(isWindowsPath("\\\\server\\share")).toBe(true);
      expect(isWindowsPath("/unix/path")).toBe(false);
    });

    test("correctly identifies Unix paths", () => {
      expect(isUnixPath("/unix/path")).toBe(true);
      expect(isUnixPath("/opt/app")).toBe(true);
      expect(isUnixPath("C:\\path")).toBe(false);
      expect(isUnixPath("relative/path")).toBe(false);
    });
  });
});

describe("PathMapper with Unix-style normalization", () => {
  describe("Unix-style config mappings with drive preservation", () => {
    const mappings = [
      { from: "/c/autoimg", to: "C:/Users/JOHANNES/AutoImaging/b0d039v2/autoimg" },
      { from: "/d/data", to: "D:/SharedData" },
      { from: "/opt/app", to: "./local/app" }
    ];
    
    const mapper = new PathMapper(mappings);

    test("maps Windows absolute paths preserving drive letters", () => {
      // When path.resolve on Windows creates C:\autoimg\paisy\skript
      // It should be normalized to /c/autoimg/paisy/skript and mapped correctly
      const windowsInput = "C:\\autoimg\\paisy\\skript\\docgener";
      const result = mapper.map(windowsInput);
      expect(result).toBe("C:\\Users\\JOHANNES\\AutoImaging\\b0d039v2\\autoimg\\paisy\\skript\\docgener");
    });

    test("maps Unix paths with drive letters", () => {
      const unixInput = "/c/autoimg/paisy/skript/docgener";
      const result = mapper.map(unixInput);
      // Should map to the Windows path specified in config
      expect(result).toBe("C:\\Users\\JOHANNES\\AutoImaging\\b0d039v2\\autoimg\\paisy\\skript\\docgener");
    });

    test("handles different drives correctly", () => {
      const dDriveInput = "D:\\data\\myfile.txt";
      const result = mapper.map(dDriveInput);
      expect(result).toBe("D:\\SharedData\\myfile.txt");
    });

    test("returns unmapped Unix paths as-is", () => {
      const unmapped = "/home/user/documents";
      expect(mapper.map(unmapped)).toBe(unmapped);
    });

    test("returns unmapped paths as-is", () => {
      const unmapped = "/usr/local/bin/script";
      expect(mapper.map(unmapped)).toBe(unmapped);
      
      const windowsUnmapped = "C:\\Windows\\System32\\cmd.exe";
      expect(mapper.map(windowsUnmapped)).toBe(windowsUnmapped);
    });

    test("maps to relative paths correctly", () => {
      const input = "/opt/app/src/index.js";
      const result = mapper.map(input);
      // The result should be platform-specific
      if (process.platform === "win32") {
        expect(result).toBe(".\\local\\app\\src\\index.js");
      } else {
        expect(result).toBe("./local/app/src/index.js");
      }
    });
  });

  describe("Edge cases and special scenarios", () => {
    test("handles paths with trailing slashes", () => {
      const mappings = [
        { from: "/data", to: "./localdata" }
      ];
      const mapper = new PathMapper(mappings);
      
      expect(mapper.map("/data/")).toBe(
        process.platform === "win32" ? ".\\localdata\\" : "./localdata/"
      );
    });

    test("handles exact matches", () => {
      const mappings = [
        { from: "/exact", to: "./mapped" }
      ];
      const mapper = new PathMapper(mappings);
      
      expect(mapper.map("/exact")).toBe(
        process.platform === "win32" ? ".\\mapped" : "./mapped"
      );
    });

    test("handles UNC paths", () => {
      const mappings = [
        { from: "/network", to: "\\\\server\\share" }
      ];
      const mapper = new PathMapper(mappings);
      
      const result = mapper.map("/network/file.txt");
      expect(result).toBe("\\\\server\\share\\file.txt");
    });
  });

  describe("Real-world scenario from user's config", () => {
    const mappings = [
      {
        from: "/c/autoimg",
        to: "C:/Users/JOHANNES.STRICKER/AutoImaging/b0d039v2/autoimg"
      },
      {
        from: "/c/home/autoimg",
        to: "C:/Users/JOHANNES.STRICKER/AutoImaging/b0d039v2/home/autoimg"
      }
    ];
    
    const mapper = new PathMapper(mappings);

    test("correctly maps the user's specific case", () => {
      // This is what happens on Windows when path.resolve("/autoimg", "/autoimg/paisy/skript/docgener")
      // produces "C:\autoimg\paisy\skript\docgener"
      const windowsResolved = "C:\\autoimg\\paisy\\skript\\docgener";
      const result = mapper.map(windowsResolved);
      
      // Should map to the correct local path
      expect(result).toBe(
        "C:\\Users\\JOHANNES.STRICKER\\AutoImaging\\b0d039v2\\autoimg\\paisy\\skript\\docgener"
      );
    });

    test("maps the args correctly", () => {
      const argPath = "C:\\autoimg\\paisy\\var\\paisy.conf";
      const result = mapper.map(argPath);
      
      expect(result).toBe(
        "C:\\Users\\JOHANNES.STRICKER\\AutoImaging\\b0d039v2\\autoimg\\paisy\\var\\paisy.conf"
      );
    });
  });
});