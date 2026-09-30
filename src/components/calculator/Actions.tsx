"use client";

import { Check, Download, FileText, Link2, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { BASE_CASE } from "@/engine";
import { PATHS } from "@/lib/site";
import { encodeInputs } from "@/lib/url-state";
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
      // Let the button repaint before the workbook is built (about a second on a laptop).
      await new Promise((r) => setTimeout(r, 30));
      const { workbookForInputs } = await import("@/lib/workbook/build");
      const { bytes } = workbookForInputs(snapshot.inputs, t, window.location.href);
      const blob = new Blob([bytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "wind-farm-model.xlsx";
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

  // The base case has a published PDF; other inputs open the report page, which the browser prints to PDF.
  const query = encodeInputs(snapshot.inputs, BASE_CASE);
  return (
    <div className="no-print flex flex-wrap gap-2">
      <Button variant="outline" size="sm" onClick={download} disabled={busy || pending || !snapshot.results}>
        <Download aria-hidden />
        {busy ? t.actions.preparing : pending ? t.actions.calculating : t.actions.excel}
      </Button>
      {query === "" ? (
        <Button asChild variant="outline" size="sm">
          <a href={PATHS.reportPdf} download>
            <FileText aria-hidden />
            {t.actions.reportPdf}
          </a>
        </Button>
      ) : (
        <Button asChild variant="outline" size="sm">
          <a
            href={`${PATHS.report}?${query}`}
            target="_blank"
            rel="noopener"
            title={t.actions.reportPrintHint}
            aria-disabled={pending || !snapshot.results}
            className={pending || !snapshot.results ? "pointer-events-none opacity-50" : undefined}
          >
            <FileText aria-hidden />
            {t.actions.reportPrint}
          </a>
        </Button>
      )}
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
