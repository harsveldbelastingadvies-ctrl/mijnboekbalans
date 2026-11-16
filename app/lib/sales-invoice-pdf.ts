import type { IssuedSalesInvoice } from "./issued-sales-invoices.ts";
import { formatDutchDate } from "./dutch-date.ts";
const money = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });
const extras: Record<string, number> = { "€": 128, "‚": 130, "ƒ": 131, "„": 132, "…": 133, "†": 134, "‡": 135, "ˆ": 136, "‰": 137, "Š": 138, "‹": 139, "Œ": 140, "Ž": 142, "‘": 145, "’": 146, "“": 147, "”": 148, "•": 149, "–": 150, "—": 151, "˜": 152, "™": 153, "š": 154, "›": 155, "œ": 156, "ž": 158, "Ÿ": 159 };
// Archived PDFs are stored as bytes; layout changes apply only to new invoices.
export function buildSalesInvoicePdf(invoice: IssuedSalesInvoice, concept = false): Blob {
    const clean = (s: string) => s.replace(/\u00a0/g, " ").replace(/\r/g, "");
    const escaped = (s: string) => [...clean(s)].map(c => { const n = extras[c] ?? c.charCodeAt(0); if (n > 255)
        throw Error(`Het teken ${c} wordt nog niet ondersteund in factuur-PDF’s. Pas deze tekst aan.`); return n < 32 ? " " : n > 126 ? `\\${n.toString(8).padStart(3, "0")}` : /[\\()]/.test(c) ? `\\${c}` : c; }).join("");
    // Standard Helvetica character widths keep amounts precisely right aligned.
    const fontWidths = [{"32":278,"33":278,"34":355,"35":556,"36":556,"37":889,"38":667,"39":191,"40":333,"41":333,"42":389,"43":584,"44":278,"45":333,"46":278,"47":278,"48":556,"49":556,"50":556,"51":556,"52":556,"53":556,"54":556,"55":556,"56":556,"57":556,"58":278,"59":278,"60":584,"61":584,"62":584,"63":556,"64":1015,"65":667,"66":667,"67":722,"68":722,"69":667,"70":611,"71":778,"72":722,"73":278,"74":500,"75":667,"76":556,"77":833,"78":722,"79":778,"80":667,"81":778,"82":722,"83":667,"84":611,"85":722,"86":667,"87":944,"88":667,"89":667,"90":611,"91":278,"92":278,"93":278,"94":469,"95":556,"96":333,"97":556,"98":556,"99":500,"100":556,"101":556,"102":278,"103":556,"104":556,"105":222,"106":222,"107":500,"108":222,"109":833,"110":556,"111":556,"112":556,"113":556,"114":333,"115":500,"116":278,"117":556,"118":500,"119":722,"120":500,"121":500,"122":500,"123":334,"124":260,"125":334,"126":584,"128":556,"130":222,"131":556,"132":333,"133":1000,"134":556,"135":556,"136":333,"137":1000,"138":667,"139":333,"140":1000,"142":611,"145":222,"146":222,"147":333,"148":333,"149":350,"150":556,"151":1000,"152":333,"153":1000,"154":500,"155":333,"156":944,"158":500,"159":667,"160":278,"161":333,"162":556,"163":556,"164":556,"165":556,"166":260,"167":556,"168":333,"169":737,"170":370,"171":556,"172":584,"173":333,"174":737,"175":333,"176":400,"177":584,"178":333,"179":333,"180":333,"181":556,"182":537,"183":278,"184":333,"185":333,"186":365,"187":556,"188":834,"189":834,"190":834,"191":611,"192":667,"193":667,"194":667,"195":667,"196":667,"197":667,"198":1000,"199":722,"200":667,"201":667,"202":667,"203":667,"204":278,"205":278,"206":278,"207":278,"208":722,"209":722,"210":778,"211":778,"212":778,"213":778,"214":778,"215":584,"216":778,"217":722,"218":722,"219":722,"220":722,"221":667,"222":667,"223":611,"224":556,"225":556,"226":556,"227":556,"228":556,"229":556,"230":889,"231":500,"232":556,"233":556,"234":556,"235":556,"236":278,"237":278,"238":278,"239":278,"240":556,"241":556,"242":556,"243":556,"244":556,"245":556,"246":556,"247":584,"248":611,"249":556,"250":556,"251":556,"252":556,"253":500,"254":556,"255":500},{"32":278,"33":333,"34":474,"35":556,"36":556,"37":889,"38":722,"39":238,"40":333,"41":333,"42":389,"43":584,"44":278,"45":333,"46":278,"47":278,"48":556,"49":556,"50":556,"51":556,"52":556,"53":556,"54":556,"55":556,"56":556,"57":556,"58":333,"59":333,"60":584,"61":584,"62":584,"63":611,"64":975,"65":722,"66":722,"67":722,"68":722,"69":667,"70":611,"71":778,"72":722,"73":278,"74":556,"75":722,"76":611,"77":833,"78":722,"79":778,"80":667,"81":778,"82":722,"83":667,"84":611,"85":722,"86":667,"87":944,"88":667,"89":667,"90":611,"91":333,"92":278,"93":333,"94":584,"95":556,"96":333,"97":556,"98":611,"99":556,"100":611,"101":556,"102":333,"103":611,"104":611,"105":278,"106":278,"107":556,"108":278,"109":889,"110":611,"111":611,"112":611,"113":611,"114":389,"115":556,"116":333,"117":611,"118":556,"119":778,"120":556,"121":556,"122":500,"123":389,"124":280,"125":389,"126":584,"128":556,"130":278,"131":556,"132":500,"133":1000,"134":556,"135":556,"136":333,"137":1000,"138":667,"139":333,"140":1000,"142":611,"145":278,"146":278,"147":500,"148":500,"149":350,"150":556,"151":1000,"152":333,"153":1000,"154":556,"155":333,"156":944,"158":500,"159":667,"160":278,"161":333,"162":556,"163":556,"164":556,"165":556,"166":280,"167":556,"168":333,"169":737,"170":370,"171":556,"172":584,"173":333,"174":737,"175":333,"176":400,"177":584,"178":333,"179":333,"180":333,"181":611,"182":556,"183":278,"184":333,"185":333,"186":365,"187":556,"188":834,"189":834,"190":834,"191":611,"192":722,"193":722,"194":722,"195":722,"196":722,"197":722,"198":1000,"199":722,"200":667,"201":667,"202":667,"203":667,"204":278,"205":278,"206":278,"207":278,"208":722,"209":722,"210":778,"211":778,"212":778,"213":778,"214":778,"215":584,"216":778,"217":722,"218":722,"219":722,"220":722,"221":667,"222":667,"223":611,"224":556,"225":556,"226":556,"227":556,"228":556,"229":556,"230":889,"231":556,"232":556,"233":556,"234":556,"235":556,"236":278,"237":278,"238":278,"239":278,"240":611,"241":611,"242":611,"243":611,"244":611,"245":611,"246":611,"247":584,"248":611,"249":611,"250":611,"251":611,"252":611,"253":556,"254":611,"255":556}];
    const width = (s: string, size: number, bold = false) => [...clean(s)].reduce((a, c) => a + (fontWidths[bold ? 1 : 0][String(extras[c] ?? c.charCodeAt(0)) as keyof typeof fontWidths[0]] ?? 556), 0) * size / 1000;
    const wrap = (s: string, max: number, size = 10) => { const rows: string[] = []; for (const para of clean(s).split("\n")) {
        let row = "";
        for (const word of para.split(/\s+/)) {
            if (row && width(`${row} ${word}`, size) > max) {
                rows.push(row);
                row = "";
            }
            let tail = word;
            while (width(tail, size) > max) {
                let n = 1;
                while (n < tail.length && width(tail.slice(0, n + 1), size) <= max)
                    n++;
                rows.push(tail.slice(0, n));
                tail = tail.slice(n);
            }
            row = row ? `${row} ${tail}` : tail;
        }
        rows.push(row);
    } return rows; };
    const pages: string[] = [];
    const left = 72, rightEdge = 499;
    let commands: string[] = [], y = 0, page = 0;
    const text = (s: string, x: number, at: number, size = 10.5, bold = false, gray = false) => commands.push(`${gray ? "0.38 0.38 0.38" : "0 0 0"} rg BT /${bold ? "F2" : "F1"} ${size} Tf ${x} ${at} Td (${escaped(s)}) Tj ET`);
    const right = (s: string, x: number, at: number, size = 10.5, bold = false) => text(s, x - width(s, size, bold), at, size, bold);
    const rule = (at: number) => commands.push(`0.4 0.4 0.4 RG 0.4 w ${left} ${at} m ${rightEdge} ${at} l S`);
    // Sender details remain on every page, beneath the example's letter-style body.
    const sender = [invoice.issuer.name, invoice.issuer.address.replace(/\n/g, ", "), `Btw-id ${invoice.issuer.vatNumber}`, invoice.issuer.kvk ? `KvK ${invoice.issuer.kvk}` : "", invoice.issuer.email, invoice.issuer.phone].filter(Boolean).join(" | ");
    const footer = wrap(sender, rightEdge - left, 7.5), footerTop = 24 + footer.length * 10;
    const bottom = Math.max(86, footerTop + 32);
    const finish = () => {
        if (!commands.length) return;
        rule(footerTop + 13);
        footer.forEach((s, i) => text(s, left, footerTop - i * 10, 7.5, false, true));
        text(`${concept ? "CONCEPT - " : ""}${invoice.number}`, left, 15, 7, false, true);
        right(`Pagina ${page}`, rightEdge, 15, 7);
        pages.push(commands.join("\n")); commands = [];
    };
    const newPage = (first = false) => {
        if (page >= 100) throw Error("De factuur is te lang. Verkort de omschrijvingen.");
        finish(); page++;
        if (concept) right("CONCEPT - NIET UITGEREIKT", rightEdge, 795, 8, true);
        if (first) {
            const customer = [invoice.customerName, invoice.customerAddress].flatMap(s => wrap(s, rightEdge - left, 10.5));
            customer.forEach((s, i) => text(s, left, 690 - i * 15));
            y = Math.min(555, 690 - customer.length * 15 - 55);
            text("Factuur", left, y, 15, true); y -= 28;
            for (const [label, value] of [["Factuurnummer:", invoice.number], ["Factuurdatum:", formatDutchDate(invoice.date)], ["Vervaldatum:", formatDutchDate(invoice.dueDate)], ["Levering / vooruitbetaling:", formatDutchDate(invoice.deliveryDate)]]) {
                text(label, left, y, 10); text(value, 218, y, 10); y -= 17;
            }
            y -= 50;
        } else {
            text(`Factuur ${invoice.number} - vervolg`, left, 760, 12, true); y = 720;
        }
    };
    const tableHead = () => { text("Omschrijving", left + 3, y); right("Totaal", rightEdge - 3, y); rule(y - 7); y -= 23; };
    const need = (height: number, table = false) => { if (y - height < bottom) { newPage(); if (table) tableHead(); } };
    const amount = (value: number, at: number, bold = false) => { text("€", 375, at, 10.5, bold); right(value.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), rightEdge - 3, at, 10.5, bold); };
    newPage(true); need(60); tableHead();
    const rates = [...new Set(invoice.lines.map(l => l.vatRate))];
    for (const line of invoice.lines) {
        const desc = wrap(line.description, 292, 10.5);
        const details = line.quantity !== 1 || invoice.prices === "exclusive"
            ? `${line.quantity.toLocaleString("nl-NL")} × ${money.format(line.unitPrice)} ${invoice.prices === "inclusive" ? "incl." : "excl."} btw · ${line.vatRate}% btw`
            : rates.length > 1 ? `${line.vatRate}% btw` : "";
        if (details) desc.push(...wrap(details, 292, 9));
        let offset = 0;
        while (offset < desc.length) {
            need(34, true);
            const count = Math.max(1, Math.min(desc.length - offset, Math.floor((y - bottom - 20) / 14)));
            desc.slice(offset, offset + count).forEach((s, i) => text(s, left + 3, y - i * 14));
            if (offset === 0) amount(line.gross, y);
            y -= count * 14; offset += count;
            if (offset < desc.length) { newPage(); tableHead(); }
        }
        y -= 10;
    }
    const groups = [0, 9, 21].map(rate => ({ rate, lines: invoice.lines.filter(l => l.vatRate === rate) })).filter(g => g.lines.length);
    need(64 + groups.length * 21); y -= 2;
    right("Subtotaal excl. btw", 351, y); amount(invoice.net, y); y -= 21;
    for (const g of groups) {
        const base = Math.round(g.lines.reduce((s, l) => s + l.net, 0) * 100) / 100;
        const vat = Math.round(g.lines.reduce((s, l) => s + l.vat, 0) * 100) / 100;
        right(groups.length > 1 ? `${g.rate}% btw over ${money.format(base)}` : `${g.rate}% btw`, 351, y);
        amount(vat, y); y -= 21;
    }
    right("Totaal te voldoen", 351, y, 10.5, true); amount(invoice.gross, y, true); y -= 38;
    const days = Math.round((Date.parse(invoice.dueDate) - Date.parse(invoice.date)) / 86400000);
    const term = days > 0 ? `binnen ${days === 14 ? "veertien" : String(days)} dagen na dagtekening` : `uiterlijk op ${formatDutchDate(invoice.dueDate)}`;
    const iban = invoice.issuer.iban.replace(/(.{4})/g, "$1 ").trim();
    const payment = `Vriendelijk verzoek ik u dit bedrag ${term} over te maken via rekeningnummer ${iban} ten name van ${invoice.issuer.accountName}, onder vermelding van factuurnummer en -datum.`;
    const paymentLines = wrap(payment, rightEdge - left, 10.5);
    need(Math.min(paymentLines.length, 5) * 14 + 18);
    for (const line of paymentLines) { need(14); text(line, left, y); y -= 14; }
    y -= 20;
    if (invoice.closing) {
        const closing = wrap(invoice.closing, rightEdge - left, 10.5);
        need(Math.min(closing.length, 5) * 14 + 35);
        closing.forEach((line, i) => { need(14); text(line, left, y); y -= i === 0 && closing.length > 1 ? 42 : 14; });
    }
    finish();
    const objects = ["", "", "", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"], ids: number[] = [];
    pages.forEach(stream => { const content = objects.length; objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`); ids.push(objects.length); objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${content} 0 R >>`); });
    objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
    objects[2] = `<< /Type /Pages /Kids [${ids.map(id => `${id} 0 R`).join(" ")}] /Count ${ids.length} >>`;
    let pdf = "%PDF-1.4\n";
    const offsets = [0];
    objects.slice(1).forEach((o, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const start = pdf.length;
    pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n${offsets.slice(1).map(o => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
    return new Blob([pdf], { type: "application/pdf" });
}
