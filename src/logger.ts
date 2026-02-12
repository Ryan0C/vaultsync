/**
 * Vault Sync — Logger
 * --------------------
 * Purpose:
 *  - Provide consistent, namespaced logging.
 *  - Respect module debug setting.
 *  - Central place to enhance logging later (remote logs, structured logs, etc).
 */

import { MODULE_ID } from "./constants";

/* -------------------------------------------- */
/*  Types                                       */
/* -------------------------------------------- */

export type LogLevel = "debug" | "info" | "warn" | "error";

/* -------------------------------------------- */
/*  Internal Helpers                            */
/* -------------------------------------------- */

function isDebugEnabled(): boolean {
  try {
    // Game may not be ready yet.
    return !!game?.settings?.get?.(MODULE_ID, "debug");
  } catch {
    return false;
  }
}

function prefix(): string {
  return `${MODULE_ID} |`;
}

/* -------------------------------------------- */
/*  Logger API                                  */
/* -------------------------------------------- */

export const logger = {
  debug: (...args: unknown[]) => {
    if (!isDebugEnabled()) return;
    console.debug(prefix(), ...args);
  },

  info: (...args: unknown[]) => {
    console.log(prefix(), ...args);
  },

  warn: (...args: unknown[]) => {
    console.warn(prefix(), ...args);
  },

  error: (...args: unknown[]) => {
    console.error(prefix(), ...args);
  }
};