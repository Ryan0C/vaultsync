// storage/fp.ts
export function FP(): any {
  // v13+ preferred
  const impl = (globalThis as any)?.foundry?.applications?.apps?.FilePicker?.implementation;
  if (impl) return impl;

  // fallback (older versions / compatibility)
  return (globalThis as any).FilePicker;
}