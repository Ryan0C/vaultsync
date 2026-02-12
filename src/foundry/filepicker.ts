/**
 * Vault Sync — FilePicker Adapter
 * --------------------------------
 * Purpose:
 *  - Provides a stable alias (`FP`) for Foundry's v13+ FilePicker implementation.
 *  - Centralizes access to file system operations used by Vault Sync.
 *
 * Why this exists:
 *  - In Foundry v13+, the global `FilePicker` is deprecated and namespaced under:
 *        foundry.applications.apps.FilePicker.implementation
 *  - Accessing the old global triggers compatibility warnings and will break in v15.
 *
 * Additions in this adapter:
 *  - Runtime guard to fail fast with a helpful message if FP is unavailable.
 *  - Minimal typed helper functions so callers don’t worry about signature details.
 */

type FileSource = "data";

// Pull the implementation (v13+)
const impl =
  (foundry as any)?.applications?.apps?.FilePicker?.implementation ??
  null;

/**
 * The raw FilePicker implementation (preferred import for low-level usage).
 * Throws immediately if not present.
 */
export const FP = (() => {
  if (!impl) {
    throw new Error(
      "Vault Sync: FilePicker implementation not found. " +
        "Are you running Foundry v13+ and loading after core initialization?"
    );
  }
  return impl as any;
})();

/**
 * Convenience helpers (thin wrappers)
 * Keeps the rest of the codebase consistent and easier to change later.
 */
export async function fpCreateDirectory(
  source: FileSource,
  path: string,
  options?: Record<string, unknown>
) {
  return FP.createDirectory(source, path, options);
}

export async function fpUpload(
  source: FileSource,
  dir: string,
  file: File,
  uploadOptions?: Record<string, unknown>,
  requestOptions?: Record<string, unknown>
) {
  return FP.upload(source, dir, file, uploadOptions, requestOptions);
}

export async function fpDelete(source: FileSource, path: string) {
  return FP.delete(source, path);
}

export async function fpGetURL(source: FileSource, path: string) {
  return FP.getURL(path, source);
}