import { ensureSentinel, insertBeforeSentinel, resetFileWithSentinel } from "../lib/sentinel";
import fs from "fs";
import os from "os";
import path from "path";

describe("sentinel", () => {
  let testFile: string;
  
  beforeEach(() => {
    testFile = path.join(os.tmpdir(), `test_${Date.now()}.txt`);
  });
  
  afterEach(() => {
    if (fs.existsSync(testFile)) {
      fs.unlinkSync(testFile);
    }
  });
  
  describe("ensureSentinel", () => {
    it("should add sentinel to file without sentinel", () => {
      fs.writeFileSync(testFile, "content without sentinel");
      ensureSentinel(testFile);
      const content = fs.readFileSync(testFile, "utf-8");
      expect(content).toContain("<!-- END -->");
    });
    
    it("should not modify file with sentinel", () => {
      fs.writeFileSync(testFile, "content\n<!-- END -->");
      const originalContent = fs.readFileSync(testFile, "utf-8");
      ensureSentinel(testFile);
      const newContent = fs.readFileSync(testFile, "utf-8");
      expect(newContent).toBe(originalContent);
    });
    
    it("should throw error if file does not exist", () => {
      expect(() => ensureSentinel(testFile)).toThrow();
    });
  });
  
  describe("insertBeforeSentinel", () => {
    it("should insert content before sentinel", () => {
      fs.writeFileSync(testFile, "<!-- END -->");
      insertBeforeSentinel(testFile, "new content");
      const content = fs.readFileSync(testFile, "utf-8");
      expect(content).toContain("new content");
      expect(content).toContain("<!-- END -->");
    });
    
    it("should throw error if sentinel is not found", () => {
      fs.writeFileSync(testFile, "content without sentinel");
      expect(() => insertBeforeSentinel(testFile, "new content")).toThrow();
    });
  });
  
  describe("resetFileWithSentinel", () => {
    it("should reset file with sentinel", () => {
      fs.writeFileSync(testFile, "old content");
      resetFileWithSentinel(testFile);
      const content = fs.readFileSync(testFile, "utf-8");
      expect(content).toBe("<!-- END -->\n");
    });
    
    it("should create file with sentinel if file does not exist", () => {
      resetFileWithSentinel(testFile);
      const content = fs.readFileSync(testFile, "utf-8");
      expect(content).toBe("<!-- END -->\n");
    });
  });
});