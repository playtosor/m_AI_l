/**
 * Shared markdown table parsing utilities.
 * Used by projects-repo, roster-repo, admin scripts, and upsert-handle.
 */

/**
 * Parse a markdown table row into trimmed, non-empty cell values.
 * Handles the pipe-delimited format: `| cell1 | cell2 | cell3 |`
 */
export function parseMarkdownTableRow(line: string): string[] {
  return line.split("|").map(part => part.trim()).filter(part => part !== "");
}

/**
 * Detect a markdown table separator row (e.g. `|------|------|`).
 * Returns true if the line contains only pipes, whitespace, colons, and hyphens.
 */
export function isMarkdownSeparatorRow(line: string): boolean {
  const normalized = line.replace(/\|/g, "").replace(/[\s:-]/g, "");
  return normalized.length === 0;
}
