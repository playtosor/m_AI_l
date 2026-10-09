import { writeMail } from "./write-mail";

export interface HandoverSelfResult {
  sender: string;
  recipient: string;
  priority: "H";
  subject: "Handover";
}

export function handoverSelfService(
  projectHandle: string,
  handle: string,
  body: string,
  sender?: string
): HandoverSelfResult {
  const actualSender = sender ?? handle;
  writeMail(projectHandle, actualSender, handle, "H", "Handover", body);

  return {
    sender: actualSender,
    recipient: handle,
    priority: "H",
    subject: "Handover",
  };
}
