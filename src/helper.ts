import { randomUUID, randomBytes } from "crypto";

export function genrateSessionId(): string {
  return randomUUID();
}

export function genrateClientId(): string {
  return "clientId-" + randomBytes(6).toString("hex"); // prefixed to differentiate
}

export function generateFourDigitCode(): string {
  return Math.floor(1000 + Math.random() * 9000).toString(); // ensures 4 digits
}
