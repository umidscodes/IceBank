"use client";
import { use } from "react";
import { ReceivedETransfers } from "@/ui/payments/ReceivedETransfers";

/** Deep link from the Ice Mail e-Transfer notice: opens that transfer's deposit panel. */
export default function ReceivedETransferDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <ReceivedETransfers focusId={Number(id)} />;
}
