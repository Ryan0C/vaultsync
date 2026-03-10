/**
 * fvtt-types augmentations for vault-sync.
 * Registers settings and module API so TypeScript knows about our types.
 */
declare global {
  interface SettingConfig {
    "vault-sync.debug": boolean;
    "vault-sync.worldUuid": string;
  }

  interface ModuleConfig {
    "vault-sync": {
      api: Record<string, (...args: any[]) => any>;
    };
  }
}
