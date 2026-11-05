/** "+3", "−2" or "0": the sign carries the meaning, not only the color. */
export function signed(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0';
}
