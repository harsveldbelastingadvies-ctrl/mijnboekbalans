"use client";
import { useEffect, useRef, useState, type InputHTMLAttributes } from "react";
import { formatDutchDate, parseDutchDate } from "../lib/dutch-date";
type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange" | "min" | "max"> & {
  value?: string; min?: string; max?: string;
  onChange: (event: { target: { value: string } }) => void;
};
/** Fixed Dutch presentation, independent of browser/OS locale. */
export function DutchDateInput({ value = "", onChange, min, max, ...props }: Props) {
  const [draft, setDraft] = useState({ iso: value, text: formatDutchDate(value) });
  const input = useRef<HTMLInputElement>(null);
  if (draft.iso !== value) setDraft({ iso: value, text: formatDutchDate(value) });
  const iso = parseDutchDate(draft.text);
  useEffect(() => {
    const error = draft.text && !iso ? "Vul een geldige datum in als dd-mm-jjjj." : iso && min && iso < min ? `Kies een datum vanaf ${formatDutchDate(min)}.` : iso && max && iso > max ? `Kies een datum tot en met ${formatDutchDate(max)}.` : "";
    input.current?.setCustomValidity(error);
  }, [draft.text, iso, min, max]);
  return <input {...props} ref={input} type="text" inputMode="numeric" placeholder="dd-mm-jjjj" maxLength={10} pattern="[0-9]{2}-[0-9]{2}-[0-9]{4}" title="Datum: dd-mm-jjjj" value={draft.text} onChange={(event) => {
    const text = event.target.value; const next = parseDutchDate(text) || (text ? "invalid" : "");
    setDraft({ iso: next, text }); onChange({ target: { value: next } });
  }} />;
}
