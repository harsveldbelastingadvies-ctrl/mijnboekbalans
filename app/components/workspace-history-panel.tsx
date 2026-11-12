"use client";
import { useState } from "react";
import { formatDutchTimestamp } from "../lib/dutch-date";
import type { WorkspaceHistory } from "../lib/workspace-store";

export function WorkspaceHistoryPanel({ pin, administrationId }: { pin: string; administrationId: string }) {
  const [history, setHistory] = useState<WorkspaceHistory[]>([]);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function request(body: Record<string, unknown>) {
    const response = await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, pin }), signal: AbortSignal.timeout(20000) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Herstelkopieën zijn niet bereikbaar.");
    return data;
  }
  async function load() {
    setBusy(true); setMessage("");
    try {
      const data = await request({ action: "history" });
      setHistory(data.history); setSelected(data.history[0]?.revision || "");
      if (!data.history.length) setMessage("Er zijn nog geen eerdere serverversies. Deze worden vanaf nu bij wijzigingen bewaard.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Ophalen mislukt."); }
    finally { setBusy(false); }
  }
  async function download() {
    setBusy(true); setMessage("");
    try {
      const data = await request({ action: "snapshot", revision: selected, administrationId });
      const url = URL.createObjectURL(new Blob([JSON.stringify(data.administration, null, 2)], { type: "application/json" }));
      const link = document.createElement("a"); link.href = url; link.download = `boekbalans-herstelkopie-${data.administration.fiscalYear}-${selected.replace(/[^a-z0-9-]/gi, "-")}.json`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage("Herstelkopie gedownload. De huidige administratie is niet gewijzigd.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Downloaden mislukt."); }
    finally { setBusy(false); }
  }
  return <section className="panel">
    <p className="eyebrow">Eerdere serverversies</p><h3>Automatische herstelkopieën</h3>
    <p className="mt-3 text-sm leading-6 text-[var(--muted)]">Vóór het opslaan van wijzigingen blijft de vorige versie bewaard. Je kunt uit de laatste 200 versies een kopie van deze administratie downloaden en controleren.</p>
    <button className="secondary-button mt-4" disabled={busy} onClick={load}>Herstelkopieën ophalen</button>
    {history.length > 0 && <div className="mt-4 grid gap-3">
      <label className="grid gap-2 text-sm">Moment van opslaan<select className="input" value={selected} onChange={(event) => setSelected(event.target.value)}>{history.map((item, index) => <option key={item.revision} value={item.revision}>{formatDutchTimestamp(item.savedAt)} · versie {history.length - index}</option>)}</select></label>
      <button className="secondary-button" disabled={busy || !selected} onClick={download}>Download eerdere versie</button>
    </div>}
    {message && <p role="status" className="mt-3 text-sm">{message}</p>}
  </section>;
}
