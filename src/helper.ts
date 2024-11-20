export function generateShareCode(): string {
  return Math.random().toString(36).substr(2, 10);
}

export function generateUniqueOrigin(): string {
  return Math.random().toString(36).substr(2, 10);
}

export function generateFourDigitCode() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}
