/** Whole-dollar demo units: 2350n → "$2,350" (the ".00" is rendered separately). */
export function fmtUsd(n: bigint | number): string {
  return "$" + Number(n).toLocaleString("en-US");
}

export function shortAddress(a: string): string {
  return a.length > 10 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

export function receiptNumber(distId: bigint | number): string {
  return "№ " + String(Number(distId)).padStart(3, "0");
}

/** Stable pseudo-random redaction-bar width from an address (leaks nothing). */
export function redactWidth(seed: string): number {
  let h = 0;
  for (let i = 2; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return 52 + (Math.abs(h) % 37); // 52–88px, same range as the mock
}
