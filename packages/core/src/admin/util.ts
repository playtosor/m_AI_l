import fs from "fs";
import { getCommonRoot } from "../domain/constants";
import { parseMarkdownTableRow, isMarkdownSeparatorRow } from "../lib/markdown";

export { getCommonRoot };

export function validateProjectsConfig(projectsPath: string): "ok" | "empty" | "malformed" {
  const content = fs.readFileSync(projectsPath, "utf-8");

  // Check if empty
  if (content.trim().length === 0) {
    return "empty";
  }

  const lines = content.split("\n").map(l => l.trim()).filter(l => l.startsWith("|"));

  // Check if has valid header
  const hasHeader = lines.some(l => {
    const parts = parseMarkdownTableRow(l);
    return parts.length >= 2 &&
      (parts[0].toLowerCase().includes("name") || parts[0].toLowerCase().includes("project"));
  });

  // Check if has separator row
  const hasSeparator = lines.some(l => {
    return isMarkdownSeparatorRow(l) && l.includes("|");
  });

  if (!hasHeader || !hasSeparator) {
    return "malformed";
  }

  return "ok";
}
