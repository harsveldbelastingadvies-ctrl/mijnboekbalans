import { payslipFonts } from "./payslip-fonts.ts";

export type PdfTableSection = {
  title: string;
  headers: string[];
  rows: Array<Array<string | number>>;
  widths: number[];
  emptyText?: string;
  alignments?: Array<"left" | "right">;
};
type ReportAdministration = { name: string; fiscalYear: number; owner?: string; kvk?: string; vatNumber?: string; iban?: string };
export function reportPdfText(value: string | number) {
  return String(value).replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, "$3-$2-$1")
    .replace(/\bEUR(?=\s*[-+]?\d)/g, "€").replace(/[\u00a0\u202f]/g, " ")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e€\n]/g, " ");
}
export function escapeReportPdfText(value: string | number) {
  return reportPdfText(value).replace(/[\\()]/g, "\\$&").replaceAll("€", "\\200").replaceAll("\n", " ");
}
export function reportTextWidth(value: string | number, size: number, bold = false) {
  const widths = payslipFonts[bold ? 1 : 0].widths;
  return [...reportPdfText(value)].reduce((sum, c) => sum + (widths[(c === "€" ? 128 : c.charCodeAt(0)) - 32] ?? 556), 0) * size / 1000;
}
function wrap(value: string | number, width: number, size: number, bold = false) {
  const lines: string[] = [];
  for (const paragraph of reportPdfText(value).split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (line && reportTextWidth(`${line} ${word}`, size, bold) > width) { lines.push(line); line = ""; }
      let tail = word;
      while (reportTextWidth(tail, size, bold) > width && tail.length > 1) {
        let count = 1;
        while (count < tail.length && reportTextWidth(tail.slice(0, count + 1), size, bold) <= width) count++;
        lines.push(tail.slice(0, count)); tail = tail.slice(count);
      }
      line = line ? `${line} ${tail}` : tail;
    }
    lines.push(line);
  }
  return lines;
}
const numeric = (value: string | number) => typeof value === "number" || /^[-+]?\s*(?:€\s*)?[-+]?\d[\d., ]*%?$/.test(reportPdfText(value).trim());
const currency = (value: string | number) => /^[-+]?\s*€\s*[-+]?\d/.test(reportPdfText(value).trim());

// Embed the existing licensed fonts so PDF readers use the same glyph widths.
export function appendReportFonts(objects: string[]) {
  payslipFonts.forEach((font, index) => {
    const streamId = objects.length;
    objects.push(`<< /Length ${font.hex.length} /Length1 ${font.length} /Filter [/ASCIIHexDecode /FlateDecode] >>\nstream\n${font.hex}\nendstream`);
    const descriptorId = objects.length;
    objects.push(`<< /Type /FontDescriptor /FontName /${font.name} /Flags 32 /FontBBox [${font.bbox.join(" ")}] /ItalicAngle 0 /Ascent ${font.ascent} /Descent ${font.descent} /CapHeight ${font.capHeight} /StemV 80 /FontFile2 ${streamId} 0 R >>`);
    objects[3 + index] = `<< /Type /Font /Subtype /TrueType /BaseFont /${font.name} /FirstChar 32 /LastChar 255 /Widths [${font.widths.join(" ")}] /Encoding /WinAnsiEncoding /FontDescriptor ${descriptorId} 0 R >>`;
  });
}

export function buildTableReportPdf(admin: ReportAdministration, title: string, periodLabel: string, sections: PdfTableSection[], options: { landscape?: boolean } = {}) {
  const pageWidth = options.landscape ? 842 : 595, pageHeight = options.landscape ? 595 : 842;
  const left = 42, right = pageWidth - 42, available = right - left, bottom = 58;
  const ink = "0.06 0.09 0.13", muted = "0.36 0.40 0.43", teal = "0 0.15 0.47", soft = "0.92 0.95 0.97", line = "0.84 0.87 0.89";
  let commands: string[] = [], y = 0, pageNumber = 0;
  const pages: string[] = [];
  const text = (value: string | number, x: number, at: number, size = 9, bold = false, color = ink) => commands.push(`${color} rg BT /${bold ? "F2" : "F1"} ${size} Tf ${x.toFixed(3)} ${at.toFixed(3)} Td (${escapeReportPdfText(value)}) Tj ET`);
  const rule = (at: number) => commands.push(`${line} RG 0.5 w ${left} ${at} m ${right} ${at} l S`);
  const rect = (at: number, height: number, color = soft) => commands.push(`${color} rg ${left} ${at} ${available} ${height} re f`);
  const finish = () => {
    if (!commands.length) return;
    rule(42); text(`BoekBalans | ${new Date().toLocaleDateString("nl-NL")}`, left, 26, 8, false, muted);
    const page = `Pagina ${pageNumber}`; text(page, right - reportTextWidth(page, 8), 26, 8, false, muted);
    pages.push(commands.join("\n")); commands = [];
  };
  const newPage = () => {
    finish(); pageNumber++;
    y = pageHeight - 48;
    text("BoekBalans", left, y, 10, true, teal); y -= 26;
    for (const row of wrap(title, available, pageNumber === 1 ? 21 : 14, true)) {
      text(row, left, y, pageNumber === 1 ? 21 : 14, true, teal); y -= pageNumber === 1 ? 26 : 19;
    }
    for (const row of wrap(`${admin.name} | ${periodLabel} | boekjaar ${admin.fiscalYear}`, available, 9)) { text(row, left, y, 9, false, muted); y -= 13; }
    if (pageNumber === 1) {
      const info = [admin.owner && `Ondernemer: ${admin.owner}`, admin.kvk && `KvK: ${admin.kvk}`, admin.vatNumber && `Btw-id: ${admin.vatNumber}`, admin.iban && `IBAN: ${admin.iban}`].filter(Boolean).join(" | ");
      if (info) for (const row of wrap(info, available, 8)) { text(row, left, y, 8, false, muted); y -= 12; }
    }
    rule(y - 2); y -= 24;
  };
  newPage();
  for (const section of sections) {
    const totalWidth = section.widths.reduce((sum, width) => sum + width, 0);
    const widths = section.widths.map(width => width / totalWidth * available);
    const aligns = section.headers.map((_, index) => section.alignments?.[index] ?? (section.rows.some(row => currency(row[index] ?? "")) ? "right" : "left"));
    const headers = section.headers.map((header, index) => wrap(header, widths[index] - 16, 8, true));
    const headerHeight = Math.max(...headers.map(rows => rows.length)) * 11 + 14;
    const heading = (continued = false) => {
      const titleRows = wrap(section.title + (continued ? " (vervolg)" : ""), available, 11, true);
      const required = titleRows.length * 15 + headerHeight + 42;
      if (y - required < bottom) newPage();
      titleRows.forEach(row => { text(row, left, y, 11, true); y -= 15; });
      y -= 5;
      if (!section.rows.length) return;
      rect(y - headerHeight + 8, headerHeight);
      let x = left;
      headers.forEach((rows, index) => {
        rows.forEach((row, lineIndex) => text(row, aligns[index] === "right" ? x + widths[index] - 8 - reportTextWidth(row, 8, true) : x + 8, y - lineIndex * 11 - 5, 8, true, teal));
        x += widths[index];
      });
      y -= headerHeight + 5;
    };
    heading();
    if (!section.rows.length) {
      wrap(section.emptyText ?? "Geen gegevens in deze periode.", available, 9).forEach(row => { if (y < bottom) newPage(); text(row, left, y, 9, false, muted); y -= 13; }); y -= 16; continue;
    }
    section.rows.forEach((row, rowIndex) => {
      const total = /^(?:totaal|btw te betalen|btw terug te vragen|fiscaal resultaat)/i.test(String(row[0]));
      const cells = row.map((cell, index) => currency(cell) ? [reportPdfText(cell)] : wrap(cell, widths[index] - 16, 9, total));
      const count = Math.max(...cells.map(rows => rows.length));
      // Keep ordinary rows together; exceptionally long descriptions continue with their header.
      if (y - (count * 13 + 10) < bottom && count * 13 + 10 < pageHeight - 220) { newPage(); heading(true); }
      let offset = 0;
      while (offset < count) {
        if (y - 23 < bottom) { newPage(); heading(true); }
        const take = Math.min(count - offset, Math.max(1, Math.floor((y - bottom - 10) / 13)));
        const height = take * 13 + 10;
        if (total || rowIndex % 2 === 1) rect(y - height + 9, height, total ? soft : "0.975 0.98 0.985");
        let x = left;
        cells.forEach((rows, index) => {
          rows.slice(offset, offset + take).forEach((row, lineIndex) => {
            const number = numeric(row), bold = total;
            const size = currency(row) ? Math.min(9, (widths[index] - 16) / Math.max(1, reportTextWidth(row, 1, bold))) : 9;
            text(row, aligns[index] === "right" || (!section.alignments?.[index] && number) ? x + widths[index] - 8 - reportTextWidth(row, size, bold) : x + 8, y - lineIndex * 13, size, bold);
          }); x += widths[index];
        });
        rule(y - height + 8); y -= height; offset += take;
      }
    });
    y -= 20;
  }
  finish();
  const encoder = new TextEncoder();
  const objects = ["", "", "", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"];
  appendReportFonts(objects);
  const pageIds: number[] = [];
  for (const stream of pages) {
    const contentId = objects.length;
    objects.push(`<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}\nendstream`);
    pageIds.push(objects.length);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`);
  }
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.slice(1).forEach((object, index) => { offsets.push(encoder.encode(pdf).length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = encoder.encode(pdf).length;
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([pdf], { type: "application/pdf" });
}
