import { SENTINEL } from "../domain/constants";
import { FileOperationError } from "../domain/errors";
import { writeFileAtomic } from "./fs-atomic";
import fs from "fs";
import path from "path";

/**
 * V2.5 SIMPLIFY WS4 — Finding #4: return the file content so callers can
 * chain without a second fs.readFileSync. Backward-compatible: existing
 * `ensureSentinel(path)` callers continue to work unchanged (they ignore
 * the return value), and the post-write content is the canonical version
 * (with sentinel appended if it was missing) so callers that pipe through
 * `parseMailboxStateFromPath(path, content)` get the right data on the
 * first try.
 */
export function ensureSentinel(filePath: string): string {
  let content: string;
  try {
    content = fs.readFileSync(filePath, "utf-8");
  } catch (error) {
    throw new FileOperationError(`Failed to read file: ${filePath}`);
  }

  if (!content.includes(SENTINEL)) {
    try {
      const appended = `${content}\n${SENTINEL}\n`;
      writeFileAtomic(filePath, appended);
      content = appended;
    } catch (error) {
      throw new FileOperationError(`Failed to append sentinel to file: ${filePath}`);
    }
  }
  return content;
}

/**
 * V2.5 SIMPLIFY WS4 — Finding #5: `insertBeforeSentinel` reads the file
 * once, but the caller may have just read it via the new `ensureSentinel`.
 * Accept the already-known content via `knownContent` to skip the second
 * readFileSync.
 */
export function insertBeforeSentinel(
  filePath: string,
  contentToInsert: string,
  knownContent?: string
): void {
  try {
    const fileContent = knownContent !== undefined
      ? knownContent
      : fs.readFileSync(filePath, "utf-8");
    if (!fileContent.includes(SENTINEL)) {
      throw new FileOperationError(`Sentinel not found in file: ${filePath}`);
    }
    const next = fileContent.replace(SENTINEL, `${contentToInsert}\n${SENTINEL}`);
    writeFileAtomic(filePath, next);
  } catch (error) {
    throw new FileOperationError(`Failed to insert content before sentinel in file: ${filePath}`);
  }
}

export function resetFileWithSentinel(filePath: string): void {
  try {
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    writeFileAtomic(filePath, `${SENTINEL}\n`);
  } catch (error) {
    throw new FileOperationError(`Failed to reset file with sentinel: ${filePath}`);
  }
}
