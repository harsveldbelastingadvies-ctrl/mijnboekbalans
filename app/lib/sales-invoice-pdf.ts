import type { IssuedSalesInvoice } from "./issued-sales-invoices.ts";
import { formatDutchDate } from "./dutch-date.ts";
const money = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });
const extras: Record<string, number> = { "€": 128, "‚": 130, "ƒ": 131, "„": 132, "…": 133, "†": 134, "‡": 135, "ˆ": 136, "‰": 137, "Š": 138, "‹": 139, "Œ": 140, "Ž": 142, "‘": 145, "’": 146, "“": 147, "”": 148, "•": 149, "–": 150, "—": 151, "˜": 152, "™": 153, "š": 154, "›": 155, "œ": 156, "ž": 158, "Ÿ": 159 };
// Version 1 is deliberately frozen: archived PDFs are stored, not rebuilt after issue.
export function buildSalesInvoicePdf(invoice: IssuedSalesInvoice, concept = false): Blob {
    const clean = (s: string) => s.replace(/\u00a0/g, " ").replace(/\r/g, "");
    const escaped = (s: string) => [...clean(s)].map(c => { const n = extras[c] ?? c.charCodeAt(0); if (n > 255)
        throw Error(`Het teken ${c} wordt nog niet ondersteund in factuur-PDF’s. Pas deze tekst aan.`); return n < 32 ? " " : n > 126 ? `\\${n.toString(8).padStart(3, "0")}` : /[\\()]/.test(c) ? `\\${c}` : c; }).join("");
    const width = (s: string, size: number) => [...clean(s)].reduce((a, c) => a + (/[ ilI.,:;'!|]/.test(c) ? .28 : /[MW@%]/.test(c) ? .92 : /[A-Z0-9]/.test(c) ? .66 : .57), 0) * size;
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
    let commands: string[] = [], y = 0, page = 0;
    const text = (s: string, x: number, at: number, size = 10, bold = false, gray = false) => commands.push(`${gray ? "0.38 0.42 0.46" : "0.10 0.14 0.20"} rg BT /${bold ? "F2" : "F1"} ${size} Tf ${x} ${at} Td (${escaped(s)}) Tj ET`);
    const right = (s: string, x: number, at: number, size = 10, bold = false) => text(s, x - width(s, size), at, size, bold);
    const rule = (at: number) => commands.push(`0.78 0.82 0.86 RG 0.6 w 44 ${at} m 551 ${at} l S`);
    const finish = () => { if (!commands.length)
        return; rule(48); text(`${concept ? "CONCEPT - " : ""}${invoice.number}`, 44, 31, 8, false, true); right(`Pagina ${page}`, 551, 31, 8); pages.push(commands.join("\n")); commands = []; };
    const newPage = (first = false) => {
        if (page >= 100)
            throw Error("De factuur is te lang. Verkort de omschrijvingen.");
        finish();
        page++;
        const name = wrap(invoice.issuer.name, 320, 13);
        name.forEach((s, i) => text(s, 44, 796 - i * 16, 13, true));
        if (concept)
            right("CONCEPT - NIET UITGEREIKT", 551, 796, 10, true);
        else
            right("FACTUUR", 551, 796, 10, true);
        y = 771 - (name.length - 1) * 16;
        if (first) {
            const seller = [invoice.issuer.address, `Btw-id ${invoice.issuer.vatNumber}`, invoice.issuer.kvk ? `KvK ${invoice.issuer.kvk}` : "", invoice.issuer.email, invoice.issuer.phone].filter(Boolean).flatMap(s => wrap(s, 235, 9));
            seller.forEach((s, i) => text(s, 316, y - i * 12, 9, false, true));
            const customer = [invoice.customerName, invoice.customerAddress].flatMap(s => wrap(s, 246, 10));
            customer.forEach((s, i) => text(s, 44, y - i * 14, 10, i === 0));
            y -= Math.max(seller.length * 12, customer.length * 14) + 36;
            text(concept ? "Conceptfactuur" : "Factuur", 44, y, 23, true);
            y -= 27;
            for (const [label, value] of [["Factuurnummer", invoice.number], ["Factuurdatum", formatDutchDate(invoice.date)], ["Levering / vooruitbetaling", formatDutchDate(invoice.deliveryDate)], ["Vervaldatum", formatDutchDate(invoice.dueDate)]]) {
                text(label, 44, y, 9, false, true);
                text(value, 206, y, 10);
                y -= 17;
            }
            y -= 20;
        }
        else {
            text(`Factuur ${invoice.number} - vervolg`, 44, y, 11, true);
            y -= 30;
        }
    };
    const tableHead = () => { rule(y + 12); text("Omschrijving", 44, y, 9, true); right("Aantal", 364, y, 9, true); right("Prijs ex. btw", 450, y, 9, true); right("Totaal incl.", 551, y, 9, true); y -= 24; };
    const need = (height: number, table = false) => { if (y - height < 77) {
        newPage();
        if (table)
            tableHead();
    } };
    newPage(true);
    need(65);
    tableHead();
    for (const line of invoice.lines) {
        const desc = wrap(line.description, 275, 10);
        let offset = 0;
        while (offset < desc.length) {
            need(42, true);
            const count = Math.max(1, Math.min(desc.length - offset, Math.floor((y - 100) / 14)));
            const part = desc.slice(offset, offset + count);
            part.forEach((s, i) => text(s, 44, y - i * 14));
            if (offset === 0) {
                right(String(line.quantity).replace(".", ","), 364, y, 9);
                right(line.unitNet.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 4 }), 450, y, 9);
                right(money.format(line.gross), 551, y, 10, true);
            }
            y -= part.length * 14;
            offset += count;
            if (offset < desc.length) {
                newPage();
                tableHead();
            }
        }
        text(`${line.vatRate}% btw`, 44, y - 2, 8, false, true);
        y -= 25;
    }
    const groups = [0, 9, 21].map(rate => ({ rate, lines: invoice.lines.filter(l => l.vatRate === rate) })).filter(g => g.lines.length);
    need(50 + groups.length * 36);
    rule(y + 6);
    y -= 18;
    for (const g of groups) {
        const base = Math.round(g.lines.reduce((s, l) => s + l.net, 0) * 100) / 100, vat = Math.round(g.lines.reduce((s, l) => s + l.vat, 0) * 100) / 100;
        right(`Grondslag ${g.rate}%`, 429, y, 9);
        right(money.format(base), 551, y, 10);
        y -= 17;
        right(`${g.rate}% btw`, 429, y, 9);
        right(money.format(vat), 551, y, 10);
        y -= 20;
    }
    right("Totaal te voldoen", 429, y, 11, true);
    right(money.format(invoice.gross), 551, y, 13, true);
    y -= 40;
    const payment = `Vriendelijk verzoek ik u ${money.format(invoice.gross)} uiterlijk op ${formatDutchDate(invoice.dueDate)} over te maken naar ${invoice.issuer.iban} ten name van ${invoice.issuer.accountName}, onder vermelding van factuurnummer ${invoice.number}.`;
    for (const paragraph of [payment, invoice.closing].filter(Boolean)) {
        const lines = wrap(paragraph, 507, 10);
        need(Math.min(lines.length, 4) * 14 + 18);
        for (const line of lines) {
            need(14);
            text(line, 44, y, 10);
            y -= 14;
        }
        y -= 18;
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
