export function safeId(id: string): string {
  // Keep filenames portable across filesystems
  return String(id ?? "unknown").replace(/[^a-zA-Z0-9_-]/g, "");
}