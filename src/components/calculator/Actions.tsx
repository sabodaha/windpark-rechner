"use client";

import { Check, Download, Link2, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Messages } from "@/messages/en";
import type { Snapshot } from "./useCalculator";

interface Props {
  snapshot: Snapshot;
  /** Newer inputs are still being calculated: the export waits for them. */
  pending: boolean;
  t: Messages;
  isCustom: boolean;
  onReset: () => void;
}

export function Actions({ snapshot, pending, t, isCustom, onReset }: Props) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const download = async () => {
    if (!snapshot.results) return;
    setBusy(true);
    try {
      const { buildWorkbook } = await import("@/lib/export");
      const bytes = buildWorkbook(snapshot.inputs, snapshot.results, t, window.location.href);
      const blob = new Blob([bytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "wind-farm-calculator.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard blocked: the URL in the address bar carries the same state
    }
  };

  return (
    <div className="no-print flex flex-wrap gap-2">
      <Button variant="outline" size="sm" onClick={download} disabled={busy || pending || !snapshot.results}>
        <Download aria-hidden />
        {busy ? t.actions.preparing : pending ? t.actions.calculating : t.actions.excel}
      </Button>
      <Button variant="outline" size="sm" onClick={copy}>
        {copied ? <Check aria-hidden /> : <Link2 aria-hidden />}
        {copied ? t.actions.copied : t.actions.copyLink}
      </Button>
      {isCustom && (
        <Button variant="ghost" size="sm" onClick={onReset}>
          <RotateCcw aria-hidden />
          {t.actions.reset}
        </Button>
      )}
    </div>
  );
}
