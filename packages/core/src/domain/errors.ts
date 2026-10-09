export class MailboxNotFoundError extends Error {
  constructor(handle: string) {
    super(`Mailbox for handle ${handle} not found.`);
    this.name = "MailboxNotFoundError";
  }
}

export class ProjectNotFoundError extends Error {
  constructor(projectHandle: string) {
    super(`Project ${projectHandle} not found in projects_config.md.`);
    this.name = "ProjectNotFoundError";
  }
}

export class RosterEntryExistsError extends Error {
  constructor(handle: string) {
    super(`Roster entry for handle ${handle} already exists.`);
    this.name = "RosterEntryExistsError";
  }
}

export class RosterEntryNotFoundError extends Error {
  constructor(handle: string) {
    super(`Roster entry for handle ${handle} not found.`);
    this.name = "RosterEntryNotFoundError";
  }
}

export class RosterEntryInactiveError extends Error {
  constructor(handle: string) {
    super(`Roster entry for handle ${handle} is inactive.`);
    this.name = "RosterEntryInactiveError";
  }
}

export class MessageNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MessageNotFoundError";
  }
}

export class MessageConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MessageConflictError";
  }
}

export class FileOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FileOperationError";
  }
}

export class ConfigCorruptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigCorruptionError";
  }
}

export class LockAcquisitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LockAcquisitionError";
  }
}


