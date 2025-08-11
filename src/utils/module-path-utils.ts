/**
 * Module Path Utilities
 * 
 * Cross-format utilities for handling file paths and module resolution
 * in both ESM and CJS environments during the build process.
 */

import { fileURLToPath } from 'url';
import { dirname } from 'path';

/**
 * Get the current file path in a way that works in both ESM and CJS builds
 */
export function getCurrentFilePath(): string {
  try {
    // ESM environment
    if (typeof import.meta !== 'undefined' && import.meta.url) {
      return fileURLToPath(import.meta.url);
    }
  } catch (error) {
    // Fall through to CJS method
  }

  // CJS environment fallback
  // In CJS builds, this will be handled by the bundler
  return __filename || process.argv[1] || '';
}

/**
 * Get the current directory path in a way that works in both ESM and CJS builds
 */
export function getCurrentDirPath(): string {
  try {
    // ESM environment
    if (typeof import.meta !== 'undefined' && import.meta.url) {
      return dirname(fileURLToPath(import.meta.url));
    }
  } catch (error) {
    // Fall through to CJS method
  }

  // CJS environment fallback
  return __dirname || dirname(process.argv[1] || '');
}

/**
 * Check if the current module is being run as the main script
 */
export function isMainModule(): boolean {
  try {
    // ESM environment
    if (typeof import.meta !== 'undefined' && import.meta.url) {
      return import.meta.url === `file://${process.argv[1]}`;
    }
  } catch (error) {
    // Fall through to CJS method
  }

  // CJS environment fallback
  return require.main === module;
}