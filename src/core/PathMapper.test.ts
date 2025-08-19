import { PathMapper } from "./PathMapper";
import path from "path";

describe("PathMapper", () => {
  describe("Unix-style paths", () => {
    const mappings = [
      { from: "/opt/application", to: "./app" },
      { from: "/var/data", to: "./data" },
      { from: "/etc/config", to: "./config" }
    ];
    
    const mapper = new PathMapper(mappings);

    test("should map Unix absolute paths correctly", () => {
      expect(mapper.map("/opt/application/src/index.js")).toBe(
        "./app/src/index.js"
      );
      expect(mapper.map("/var/data/file.txt")).toBe(
        "./data/file.txt"
      );
    });

    test("should handle paths without mappings", () => {
      expect(mapper.map("/usr/local/bin/script.sh")).toBe(
        "/usr/local/bin/script.sh"
      );
    });

    test("should handle relative paths", () => {
      expect(mapper.map("./local/file.txt")).toBe("./local/file.txt");
      expect(mapper.map("../parent/file.txt")).toBe("../parent/file.txt");
      expect(mapper.map("file.txt")).toBe("./file.txt");
    });
  });

  describe("Windows-style paths", () => {
    const mappings = [
      { from: "C:\\Production\\App", to: ".\\app" },
      { from: "D:\\Data", to: ".\\data" },
      { from: "C:/Production/App", to: "./app" }, // Mixed separators
    ];
    
    const mapper = new PathMapper(mappings);

    test("should map Windows absolute paths correctly", () => {
      // Test with backslash separators
      const result1 = mapper.map("C:\\Production\\App\\src\\index.js");
      // The mapper returns platform-specific separators
      expect(result1).toBe("." + path.sep + "app" + path.sep + "src" + path.sep + "index.js");
      
      const result2 = mapper.map("D:\\Data\\file.txt");
      expect(result2).toBe("." + path.sep + "data" + path.sep + "file.txt");
    });

    test("should handle Windows paths with forward slashes", () => {
      const result = mapper.map("C:/Production/App/src/index.js");
      expect(result).toBe("." + path.sep + "app" + path.sep + "src" + path.sep + "index.js");
    });

    test("should handle Windows paths without mappings", () => {
      const result = mapper.map("C:\\Windows\\System32\\cmd.exe");
      // Should return as-is since it's already a local absolute path
      expect(result).toBe("C:\\Windows\\System32\\cmd.exe");
    });

    test("should not duplicate Windows absolute paths", () => {
      // This was the original bug - ensure it doesn't prepend ./ to absolute paths
      const result = mapper.map("C:\\Users\\username\\project\\file.txt");
      expect(result).toBe("C:\\Users\\username\\project\\file.txt");
      expect(result).not.toContain("./C:");
    });
  });

  describe("Cross-platform edge cases", () => {
    const mappings = [
      { from: "/prod/app", to: "./local/app" },
      { from: "\\\\network\\share", to: "./network" }, // UNC path
    ];
    
    const mapper = new PathMapper(mappings);

    test("should handle empty path", () => {
      expect(mapper.map("")).toBe("./");
    });

    test("should handle paths with trailing slashes", () => {
      const result1 = mapper.map("/prod/app/");
      expect(result1).toBe("." + path.sep + "local" + path.sep + "app" + path.sep);
      
      const result2 = mapper.map("/prod/app");
      expect(result2).toBe("." + path.sep + "local" + path.sep + "app");
    });

    test("should handle UNC paths", () => {
      const result = mapper.map("\\\\network\\share\\file.txt");
      expect(result).toBe("." + path.sep + "network" + path.sep + "file.txt");
    });

    test("should preserve relative paths that don't match mappings", () => {
      expect(mapper.map("./relative/path.txt")).toBe("./relative/path.txt");
      expect(mapper.map("../parent/path.txt")).toBe("../parent/path.txt");
    });
  });

  describe("Mapping with similar prefixes", () => {
    const mappings = [
      { from: "/app", to: "./app1" },
      { from: "/application", to: "./app2" },
      { from: "/app/data", to: "./app-data" },
    ];
    
    const mapper = new PathMapper(mappings);

    test("should match the most specific mapping first", () => {
      // Since mappings are checked in order, the first match wins
      expect(mapper.map("/app/file.txt")).toBe(
        "." + path.sep + "app1" + path.sep + "file.txt"
      );
      expect(mapper.map("/application/file.txt")).toBe(
        "." + path.sep + "app2" + path.sep + "file.txt"
      );
      expect(mapper.map("/app/data/file.txt")).toBe(
        "." + path.sep + "app1" + path.sep + "data" + path.sep + "file.txt"
      ); // First match wins
    });
  });
});