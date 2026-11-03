import { readFileSync } from 'fs';

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}. See .env.example.`);
  return value;
}

/** Reads a PEM key from the file named by the variable, so keys never sit in env values or images. */
export const readKeyFile = (name: string): string => readFileSync(requireEnv(name), 'utf8');
