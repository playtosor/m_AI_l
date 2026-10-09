import { OutboxEntry } from "../domain/types";
import { getOutboxPath } from "../lib/paths";
import { ensureSentinel, insertBeforeSentinel } from "../lib/sentinel";
import { FileOperationError } from "../domain/errors";
import fs from "fs";

export function getOutbox(projectPath: string, handle: string): OutboxEntry[] {
  const outboxPath = getOutboxPath(projectPath, handle);
  return getOutboxFromPath(outboxPath);
}

export function getOutboxFromPath(outboxPath: string): OutboxEntry[] {
  if (!fs.existsSync(outboxPath)) {
    throw new FileOperationError(`Outbox not found: ${outboxPath}`);
  }

  // V2.5 SIMPLIFY WS4 — Finding #6: reuse content from ensureSentinel.
  const content = ensureSentinel(outboxPath);
  const outboxSection = content.split("<!-- END -->")[0].trim();

  if (!outboxSection) {
    return [];
  }

  const lines = outboxSection.split("\n").filter(line => line.trim() !== "");
  return lines.map(line => parseOutboxEntry(line));
}

export function writeOutboxEntry(projectPath: string, handle: string, entry: OutboxEntry): void {
  const outboxPath = getOutboxPath(projectPath, handle);
  writeOutboxEntryToPath(outboxPath, entry);
}

export function writeOutboxEntryToPath(outboxPath: string, entry: OutboxEntry): void {
  if (!fs.existsSync(outboxPath)) {
    throw new FileOperationError(`Outbox not found: ${outboxPath}`);
  }

  // V2.5 SIMPLIFY WS4 — Finding #6: share content with insertBeforeSentinel.
  const content = ensureSentinel(outboxPath);
  const formattedEntry = formatOutboxEntry(entry);
  insertBeforeSentinel(outboxPath, formattedEntry, content);
}

function parseOutboxEntry(line: string): OutboxEntry {
  const parts = line.split(" // ");
  if (parts.length !== 3) {
    throw new Error(`Invalid outbox entry format: ${line}`);
  }
  
  return {
    timestamp: parts[0],
    recipient: parts[1],
    subject: parts[2],
  };
}

function formatOutboxEntry(entry: OutboxEntry): string {
  return `${entry.timestamp} // ${entry.recipient} // ${entry.subject}`;
}
