import type { Metadata } from "next";
import { ProofView } from "@/components/proof/ProofView";

export const metadata: Metadata = {
  title: "Signet — Sealed disclosure",
  description: "Verify a Signet selective-disclosure proof. The amount stays sealed.",
};

export default async function ProofPage({ params }: { params: Promise<{ proofId: string }> }) {
  const { proofId } = await params;
  return <ProofView proofId={proofId} />;
}
