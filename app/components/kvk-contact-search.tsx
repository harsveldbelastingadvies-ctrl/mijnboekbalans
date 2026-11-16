"use client";
import { useEffect, useRef, useState } from "react";
export type KvkContactResult = { name: string; kvk: string; address: string };

/** Only a selected result changes the contact; searching never submits its form. */
export function KvkContactSearch({ initialQuery, onSelect }: { initialQuery: string; onSelect: (result: KvkContactResult) => void }) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<KvkContactResult[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => { request.current?.abort(); request.current = null; }, []);

  const search = async () => {
    const term = query.trim();
    if (term.length < 2) { setMessage("Vul minstens twee tekens of een volledig KvK-nummer in."); return; }
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setResults([]); setMessage("Zoeken bij KvK…");
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`/api/kvk/search?q=${encodeURIComponent(term)}`, { signal: controller.signal });
      const data = await response.json() as { results?: KvkContactResult[]; error?: string };
      if (request.current !== controller || controller.signal.aborted) return;
      if (!response.ok) throw new Error(data.error || "KvK zoeken is nu niet beschikbaar. Probeer het opnieuw.");
      const found = (data.results ?? []).filter(r => r && typeof r.name === "string" && typeof r.kvk === "string" && typeof r.address === "string");
      setResults(found);
      setMessage(found.length ? "Kies de juiste onderneming. Controleer daarna de ingevulde gegevens." : "Geen onderneming gevonden. Pas je zoekopdracht aan of vul de gegevens handmatig in.");
    } catch (error) {
      if (request.current !== controller) return;
      setMessage(controller.signal.aborted ? "Het zoeken duurde te lang. Probeer opnieuw of vul de gegevens handmatig in." : error instanceof Error ? error.message : "KvK zoeken is nu niet beschikbaar.");
    } finally {
      clearTimeout(timeout);
      if (request.current === controller) { setBusy(false); request.current = null; }
    }
  };
  const editQuery = (value: string) => {
    request.current?.abort(); request.current = null;
    setQuery(value); setResults([]); setMessage(""); setBusy(false);
  };
  return <div className="kvk-search-box">
    <div className="flex flex-wrap items-end gap-2">
      <label className="grid min-w-0 flex-1 gap-1 text-sm font-semibold">Zoeken bij KvK<input className="input" placeholder="Bedrijfsnaam of KvK-nummer" value={query} onChange={e => editQuery(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); if (!busy) void search(); } }} /></label>
      <button type="button" className="secondary-button" disabled={busy} onClick={search}>{busy ? "Zoeken…" : "Zoek bij KvK"}</button>
    </div>
    <p className="mt-2 text-xs text-[var(--muted)]" role="status" aria-live="polite">{message || "Zoek op bedrijfsnaam of KvK-nummer en kies een resultaat om de bedrijfsgegevens aan te vullen."}</p>
    {results.length > 0 && <ul className="mt-3 grid gap-2" aria-label="KvK-zoekresultaten">{results.map((result, index) => <li key={`${result.kvk}-${index}`}><button type="button" className="secondary-button w-full text-left" onClick={() => { onSelect(result); setResults([]); setMessage("Bedrijfsgegevens ingevuld. Controleer deze en kies ‘Opslaan en selecteren’."); }}><span className="grid gap-1"><strong>{result.name || "Onderneming"}</strong><span className="text-xs">KvK {result.kvk}{result.address ? ` · ${result.address}` : ""}</span></span></button></li>)}</ul>}
  </div>;
}
