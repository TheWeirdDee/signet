/**
 * Demo mode dataset + copy — mirrors signet-app.html exactly. This is what the
 * 3-minute video records against, so wording and values must not drift.
 */

export const DEMO_ROWS = `0x4A9f…Meridian grant  , 2350
0x71c2…contributor A     , 1800
0x0eD5…contributor B     , 3200
0x9Bb1…contributor C     , 1250
0xF33a…contributor D     , 2600
0x1D8e…contributor E     , 900`;

export const DEMO_LEDGER = [
  { n: "01", addr: "0x4A9f…", width: 74, claimed: true },
  { n: "02", addr: "0x71c2…", width: 58, claimed: true },
  { n: "03", addr: "0x0eD5…", width: 88, claimed: false },
  { n: "04", addr: "0x9Bb1…", width: 66, claimed: true },
  { n: "05", addr: "0xF33a…", width: 80, claimed: true },
  { n: "06", addr: "0x1D8e…", width: 52, claimed: false },
];

export const DEMO_CLAIM = {
  receiptNo: "№ 047",
  network: "sepolia",
  amount: "$2,350.00",
  issuer: "Meridian Grants Fund",
  verifier: "Northwind Lending",
};

export const DEMO_TX_HASH = "0x8f3a…c210";
export const DEMO_PROOF_LINK = "signet.app/p/0x9c…a4e2";

export type PredicateKey = "ge" | "issuer" | "both";

export const DEMO_PRED_TEXT: Record<PredicateKey, [string, string][]> = {
  ge: [["allocation ≥ $2,000", "TRUE"]],
  issuer: [["issued by verified fund", "TRUE"]],
  both: [
    ["allocation ≥ $2,000", "TRUE"],
    ["issued by verified fund", "TRUE"],
  ],
};

/** Parse "label-or-address , amount" rows (same tolerant parser as the mock). */
export function parseRows(text: string): { label: string; amount: number }[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const parts = l.split(",");
      const amount = parseFloat((parts[parts.length - 1] || "").replace(/[^0-9.]/g, "")) || 0;
      const label = parts.slice(0, -1).join(",").trim() || l;
      return { label, amount };
    });
}
