import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Resolve a secret value — returns as-is unless it starts with "op://",
 * in which case it fetches the value from 1Password CLI.
 */
export async function resolveSecret(value) {
  if (!value || !value.startsWith('op://')) return value;
  const { stdout } = await execFileAsync('op', ['read', value]);
  return stdout.trim();
}
