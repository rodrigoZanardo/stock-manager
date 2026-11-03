import { readFileSync } from 'fs';

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}. See .env.example.`);
  return value;
}

/** Reads a PEM key from the file named by `fileVar`, or from `valueVar` when that is set (hosts without shared volumes, like Render). */
export function readKey(fileVar: string, valueVar: string): string {
  const value = process.env[valueVar];
  // some dashboards store the line breaks of a PEM as the two characters backslash and n
  if (value) return value.replace(/\\n/g, '\n');
  return readFileSync(requireEnv(fileVar), 'utf8');
}
