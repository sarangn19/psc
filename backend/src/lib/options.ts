export function normalizeOptions(options: unknown): string[] {
  if (Array.isArray(options)) return options as string[];
  if (typeof options === 'string') {
    try {
      const parsed: unknown = JSON.parse(options);
      if (Array.isArray(parsed)) return parsed as string[];
    } catch {
      // fall through
    }
  }
  return [];
}
