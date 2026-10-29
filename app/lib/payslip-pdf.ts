type Section = { title: string; headers: string[]; rows: Array<Array<string | number>>; widths: number[] };
type Employer = { name: string; fiscalYear: number };

// Presentation only: render the supplied payroll snapshot without recalculation.
export function buildModernPayslipPdf(admin: Employer, title: string, period: string, sections: Section[]) {
  const ink = "0.08 0.16 0.20", muted = "0.31 0.39 0.42", teal = "0.03 0.36 0.34";
  const safe = (v: string | number) => String(v).replaceAll("€", "EUR").replaceAll("\u00a0", " ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e]/g, " ");
  const escape = (v: string | number) => safe(v).replace(/[\\()]/g, "\\$&");
  const pages: string[] = []; let commands: string[] = []; let y = 0; let page = 0;
  const text = (v: string | number, x: number, at: number, size = 9, color = ink, bold = false) => commands.push(`${color} rg BT /${bold ? "F2" : "F1"} ${size} Tf ${x} ${at} Td (${escape(v)}) Tj ET`);
  const rect = (x: number, at: number, w: number, h: number, color: string) => commands.push(`${color} rg ${x} ${at} ${w} ${h} re f`);
  const line = (at: number) => commands.push(`0.84 0.89 0.88 RG 0.5 w 42 ${at} m 553 ${at} l S`);
  // Conservative bounds leave space for wide Helvetica glyphs and long identifiers.
  const wrap = (v: string | number, width: number, size = 9) => {
    const max = Math.max(1, Math.floor(width / (size * 0.62))); const result: string[] = [];
    let current = "";
    for (const word of safe(v).split(/\s+/)) {
      if (current && current.length + word.length + 1 > max) { result.push(current); current = ""; }
      let rest = word;
      while (rest.length > max) { result.push(rest.slice(0, max)); rest = rest.slice(max); }
      current = current ? `${current} ${rest}` : rest;
    }
    if (current || !result.length) result.push(current);
    return result;
  };
  const finish = () => {
    if (!commands.length) return;
    line(47); text("BoekBalans / Salarisadministratie", 42, 31, 8, muted);
    text(`Boekjaar ${admin.fiscalYear}  /  Pagina ${page}`, 411, 31, 8, muted);
    pages.push(commands.join("\n")); commands = [];
  };
  const newPage = () => {
    finish(); page++;
    rect(42, 793, 24, 4, teal); text("BoekBalans", 76, 790, 12, teal, true);
    text(/concept/i.test(title) ? "CONCEPT / LOONSTROOK" : "SALARISSPECIFICATIE", 42, 768, 8, muted, true);
    text(title, 42, 744, 24, ink, true);
    const employerLines = wrap(`${admin.name} / ${period}`, 511, 10);
    employerLines.forEach((v, i) => text(v, 42, 724 - i * 13, 10, muted));
    y = 700 - (employerLines.length - 1) * 13;
    if (page === 1) {
      const net = sections.flatMap(s => s.rows).find(r => /^Netto uit te betalen$/i.test(String(r[0])));
      if (net) {
        rect(42, y - 65, 511, 65, "0.91 0.96 0.94");
        text("NETTO UIT TE BETALEN", 58, y - 22, 8, teal, true);
        text(net[1], 58, y - 49, 23, teal, true);
        text("Deze loonperiode", 414, y - 36, 9, muted); y -= 88;
      }
    } else { text("Vervolg / specificatie", 42, y, 9, teal, true); y -= 25; }
  };
  const heading = (label: string) => { text(label, 42, y, 12, teal, true); y -= 12; line(y); y -= 19; };
  newPage();
  sections.forEach(section => {
    if (!section.rows.length) return;
    const calculation = /berekening|bruto naar netto/i.test(section.title);
    const groups: Array<Array<Array<string | number>>> = calculation ? section.rows.map(row => [row]) : Array.from({length: Math.ceil(section.rows.length / 2)}, (_, i) => section.rows.slice(i * 2, i * 2 + 2));
    const heights = groups.map(group => calculation
      ? Math.max(wrap(group[0][0], 335).length, wrap(group[0][1], 145).length) * 12 + 10
      : Math.max(...group.map(row => wrap(row[0], 235, 7.5).length * 10 + wrap(row[1], 235).length * 12)) + 8);
    // Keep short sections together; repeat section labels when long sections span pages.
    const total = heights.reduce((a,b) => a+b, 0) + 45;
    if (y - Math.min(total, 130) < 65) newPage();
    heading(section.title);
    groups.forEach((group, i) => {
      if (y - heights[i] < 65) { newPage(); heading(`${section.title} (vervolg)`); }
      if (calculation) {
        const row = group[0]; const strong = /totaal bruto|netto uit te betalen/i.test(String(row[0]));
        if (strong) rect(42, y - heights[i] + 7, 511, heights[i], "0.94 0.97 0.96");
        wrap(row[0], 335).forEach((v,j) => text(v, 50, y - j*12, 9, ink, strong));
        wrap(row[1], 145).forEach((v,j) => {
          const width = [...v].reduce((n,c) => n + ("0123456789".includes(c) ? 556 : c === " " || c === "." || c === "," ? 278 : c === "-" ? 333 : c === "E" ? 667 : c === "U" || c === "R" ? 722 : 600), 0) * 9/1000;
          text(v, 543-width, y-j*12, 9, ink, true);
        });
      } else group.forEach((row,j) => {
        const x = 42 + j*264; const labels = wrap(row[0],235,7.5);
        labels.forEach((v,k) => text(v,x,y-k*10,7.5,muted));
        wrap(row[1],235).forEach((v,k) => text(v,x,y-labels.length*10-3-k*12,9,ink,true));
      });
      y -= heights[i];
    });
    y -= 10;
  });
  finish();
  const encoder = new TextEncoder();
  const objects = ["", "", "", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"];
  const ids: number[] = [];
  pages.forEach(stream => {
    const content = objects.length; objects.push(`<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}\nendstream`);
    ids.push(objects.length); objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${content} 0 R >>`);
  });
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${ids.map(id => `${id} 0 R`).join(" ")}] /Count ${ids.length} >>`;
  let pdf = "%PDF-1.4\n"; const offsets = [0];
  objects.slice(1).forEach((object,i) => { offsets.push(encoder.encode(pdf).length); pdf += `${i+1} 0 obj\n${object}\nendobj\n`; });
  const start = encoder.encode(pdf).length;
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10,"0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return new Blob([pdf], {type:"application/pdf"});
}
