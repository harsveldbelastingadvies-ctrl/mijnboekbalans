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
  // Employee snapshots combine holiday reserves and cumulatives in one section.
  // Move only the cumulative rows; retain holiday information in the main body.
  const cumulativeRows: Array<Array<string | number>> = [];
  const bodySections = sections.map(section => {
    if (!/cumulatie/i.test(section.title)) return section;
    const combined = /vakantiegeld/i.test(section.title);
    const rows = section.rows.filter(row => {
      if (!combined || /cumulatie/i.test(String(row[0]))) { cumulativeRows.push(row); return false; }
      return true;
    });
    return {...section, title: combined ? "Vakantiegeld" : section.title, rows};
  });
  const compactEmployee = () => {
    const calculation = bodySections.find(s => /bruto naar netto/i.test(s.title));
    if (!calculation) return false;
    // Measure every block before drawing. Longer exceptional records retain the
    // flowing layout instead of losing fields or shrinking the type to fit.
    type Cell = {label: string[]; value: string[]};
    const shortLabel = (v: string | number) => ({
      "Schriftelijk / onbepaalde tijd / oproep":"Schriftelijk / vast / oproep",
      "Contracturen per week":"Contracturen / week",
      "Verloonde uren deze maand":"Verloonde uren / maand",
      "Toepasselijk minimumuurloon":"Minimumuurloon",
      "Verrekende arbeidskorting (in loonheffing)":"Arbeidskorting in loonheffing",
      "Pensioen werkgever (geen inhouding)":"Pensioen werkgever",
      "Werkgeversheffing Zvw (geen inhouding)":"Zvw werkgever",
      "Grondslag premies / Zvw (VCR)":"Premiegrondslag / Zvw (VCR)",
      "Totale werkgeverskosten incl. reservering":"Werkgeverskosten incl. reserve",
      "Vakantiegeldgrondslag / percentage":"Grondslag / percentage",
      "Opbouw vakantiegeld deze maand":"Opbouw deze maand",
      "Reserve vakantiegeld einde periode":"Reserve einde periode",
    } as Record<string,string>)[String(v)] ?? String(v);
    const shortValue = (v:string|number) => v === "Wit / maand / Nederland / standaard 2026" ? "Wit / maand / NL / standaard 2026" : v;
    const cell = (row: Array<string | number>, width: number): Cell => ({label:wrap(shortLabel(row[0]),width,7.2),value:wrap(shortValue(row[1]),width,8.5)});
    const grid = (rows: Array<Array<string | number>>, columns: number, width: number) => {
      const gap = 12, columnWidth = (width-(columns-1)*gap)/columns;
      const cells = rows.map(row => cell(row,columnWidth));
      const groups = Array.from({length:Math.ceil(cells.length/columns)},(_,i)=>cells.slice(i*columns,i*columns+columns));
      const heights = groups.map(group=>Math.max(...group.map(c=>c.label.length*9+c.value.length*10))+5);
      return {groups,heights,columnWidth,gap,height:heights.reduce((a,b)=>a+b,0)};
    };
    const bodyOther = bodySections.filter(s=>s!==calculation && !/heffingen en pensioen|vakantiegeld/i.test(s.title) && s.rows.length);
    const details = bodySections.find(s=>/heffingen en pensioen/i.test(s.title));
    const holiday = bodySections.find(s=>/vakantiegeld/i.test(s.title));
    const data = bodyOther.map(s=>({title:s.title,...grid(s.rows,3,511)}));
    const holidayGrid = grid(holiday?.rows ?? [],2,293);
    const cumulativeGrid = grid(cumulativeRows,4,487);
    const amountWidth = (v:string,size:number) => [...v].reduce((n,c)=>n+("0123456789".includes(c)?556:c===" "||c==="."||c===","?278:c==="-"?333:c==="E"?667:c==="U"||c==="R"?722:600),0)*size/1000;
    const calcRows = calculation.rows.map(row=>({label:wrap(row[0],198,8.5),value:wrap(row[1],79,8.5),strong:/totaal bruto|netto uit te betalen/i.test(String(row[0]))}));
    const calcHeights = calcRows.map(row=>Math.max(row.label.length,row.value.length)*11+5);
    const detailRows = (details?.rows ?? []).map(row=>{
      const inline = /^(?:EUR\s|€\s|Ja$|Nee$)/.test(safe(row[1]));
      return {inline,label:wrap(shortLabel(row[0]),inline?123:194,7.2),value:wrap(shortValue(row[1]),inline?65:194,8.5)};
    });
    const detailHeights = detailRows.map(row=>(row.inline?Math.max(row.label.length*9,row.value.length*10):row.label.length*9+row.value.length*10)+5);
    const employerLines=wrap(`${admin.name} / ${period}`,310,9);
    const top=722-(employerLines.length-1)*11;
    const dataHeight=data.reduce((n,s)=>n+22+s.height+6,0);
    const leftHeight=22+calcHeights.reduce((a,b)=>a+b,0)+(holiday?.rows.length?32+holidayGrid.height:0);
    const rightHeight=22+detailHeights.reduce((a,b)=>a+b,0);
    const footerHeight=32+cumulativeGrid.height;
    if (top-dataHeight-Math.max(leftHeight,rightHeight)<65+footerHeight+12) return false;
    page=1;
    rect(42,793,24,4,teal);text("BoekBalans",76,790,12,teal,true);
    text(/concept/i.test(title)?"CONCEPT / SALARISSPECIFICATIE":"SALARISSPECIFICATIE",42,772,7.5,muted,true);
    text("Loonstrook medewerker",42,750,20,ink,true);
    employerLines.forEach((v,i)=>text(v,42,734-i*11,9,muted));
    const net=calculation.rows.find(row=>/^Netto uit te betalen$/i.test(String(row[0])));
    if(net){rect(376,737,177,64,"0.91 0.96 0.94");text("NETTO UIT TE BETALEN",388,781,7.2,teal,true);text(net[1],388,754,18,teal,true);}
    const blockTitle=(label:string,x:number,at:number,width:number)=>{
      text(label,x,at,10,teal,true);rect(x,at-8,width,0.5,"0.84 0.89 0.88");
    };
    const drawGrid=(g:ReturnType<typeof grid>,x:number,at:number)=>{
      g.groups.forEach((group,i)=>{
        group.forEach((c,j)=>{
          const cx=x+j*(g.columnWidth+g.gap);
          c.label.forEach((v,k)=>text(v,cx,at-k*9,7.2,muted));
          c.value.forEach((v,k)=>text(v,cx,at-c.label.length*9-2-k*10,8.5,ink,true));
        });
        at-=g.heights[i];
      });
    };
    let at=top;
    data.forEach(s=>{blockTitle(s.title,42,at,511);drawGrid(s,42,at-22);at-=22+s.height+6;});
    blockTitle("Van bruto naar netto",42,at,293);
    let left=at-22;
    calcRows.forEach((row,i)=>{
      if(row.strong)rect(42,left-calcHeights[i]+6,293,calcHeights[i],"0.94 0.97 0.96");
      row.label.forEach((v,k)=>text(v,48,left-k*11,8.5,ink,row.strong));
      row.value.forEach((v,k)=>text(v,329-amountWidth(v,8.5),left-k*11,8.5,ink,true));
      left-=calcHeights[i];
    });
    if(holiday?.rows.length){left-=10;blockTitle("Vakantiegeld",42,left,293);drawGrid(holidayGrid,42,left-22);}
    blockTitle("Heffingen en pensioen",359,at,194);
    let right=at-22;
    detailRows.forEach((row,i)=>{
      row.label.forEach((v,k)=>text(v,359,right-k*9,7.2,muted));
      row.value.forEach((v,k)=>text(v,row.inline?553-amountWidth(v,8.5):359,right-(row.inline?0:row.label.length*9+2)-k*10,8.5,ink,true));
      right-=detailHeights[i];
    });
    if(cumulativeRows.length){
      const footerTop=65+footerHeight;
      rect(42,65,511,footerHeight,"0.94 0.97 0.96");
      text("Cumulatieven t/m deze periode",54,footerTop-17,10,teal,true);
      drawGrid(cumulativeGrid,54,footerTop-32);
    }
    return true;
  };
  if (!compactEmployee()) {
    newPage();
    bodySections.forEach(section => {
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
    if (cumulativeRows.length) {
      const groups = Array.from({length: Math.ceil(cumulativeRows.length / 3)}, (_, i) => cumulativeRows.slice(i*3, i*3+3));
      const heights = groups.map(group => Math.max(...group.map(row => wrap(row[0], 148, 7.5).length*10 + wrap(row[1],148).length*12)) + 12);
      let start = 0;
      while (start < groups.length) {
        const remainingHeight = heights.slice(start).reduce((a,b) => a+b,0) + 42;
        if (y - remainingHeight < 65) newPage();
        // Keep the usual block intact. Extremely long migrated details can continue.
        let end = start; let height = 42;
        while (end < groups.length && height + heights[end] <= y - 65) { height += heights[end]; end++; }
        if (end === start) throw new Error("De cumulatieve toelichting is te lang voor een PDF-pagina. Verkort de toelichting.");
        const top = 65 + height;
        rect(42, 65, 511, height, "0.94 0.97 0.96");
        text(start ? "Cumulatieven (vervolg)" : "Cumulatieven t/m deze periode", 54, top-21, 11, teal, true);
        let at = top-42;
        for (let i = start; i < end; i++) {
          groups[i].forEach((row,j) => {
            const x = 54+j*167;
            const labels = wrap(row[0],148,7.5);
            labels.forEach((v,k) => text(v,x,at-k*10,7.5,muted));
            wrap(row[1],148).forEach((v,k) => text(v,x,at-labels.length*10-3-k*12,9,ink,true));
          });
          at -= heights[i];
        }
        start = end;
        if (start < groups.length) newPage();
      }
    }
  }
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
