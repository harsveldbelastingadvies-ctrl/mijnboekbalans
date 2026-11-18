import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { buildTableReportPdf, reportTextWidth, reportPdfText } from '../app/lib/table-pdf.ts';
import { formatDutchDate } from '../app/lib/dutch-date.ts';
import { getVatDate, isDeferredVat } from '../app/lib/vat-period.ts';
import { vatEntries } from '../app/lib/payroll-accounting.ts';
import { deductibleExpenseVat } from '../app/lib/expense-tax.ts';
import { invoicedVat, dutchVat, usesDutchSalesVat, buildInternationalVat, salesVatOptions } from '../app/lib/international-vat.ts';
const admin = {name:'Voorbeeldadministratie',owner:'Testondernemer',fiscalYear:2026,kvk:'12345678',vatNumber:'NL123456789B01'};
const money = new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'});
const source = ts.createSourceFile('page.tsx',readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const names = ['buildEntriesPdf','buildVatOverviewPdf','buildVatOverview'];
const code = source.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.includes(n.name?.text)).map(n=>n.getText(source)).join('\n');
const context = vm.createContext({buildTablePdf:buildTableReportPdf,money,formatDutchDate,getVatDate,isDeferredVat,vatEntries,deductibleExpenseVat,invoicedVat,dutchVat,usesDutchSalesVat,buildInternationalVat,salesVatOptions,clampPercent:n=>Math.max(0,Math.min(100,n)),formatEntryProcessing:e=>e.purchaseVat==='nl_reverse'?'Btw verlegd naar cliënt (2a): € 210,00':e.processing||''});
vm.runInContext(ts.transpile(code,{target:ts.ScriptTarget.ES2022}),context);
export const entries = [
  {id:'1',date:'2026-11-01',invoiceNumber:'2026-001',relation:'Voorbeeldklant met een langere bedrijfsnaam',description:'Advieswerkzaamheden en administratieve ondersteuning',category:'Omzet diensten',type:'income',amount:12345.67,vatRate:21,status:'paid',paidDate:'2026-11-15'},
  {id:'2',date:'2026-11-02',invoiceNumber:'INK-002',relation:'Onderaannemer',description:'Werkzaamheden op locatie',category:'Inkoop diensten',type:'expense',amount:1000,vatRate:21,purchaseVat:'nl_reverse',status:'open'},
  {id:'3',date:'2026-11-03',invoiceNumber:'CREDIT-003',relation:'Leverancier',description:'Creditnota voor retourgoederen',category:'Kantoorkosten',type:'expense',amount:-25,vatRate:9,status:'open'},
];
const commands = pdf => [...pdf.matchAll(/BT \/F[12] ([\d.]+) Tf ([\d.]+) ([\d.]+) Td \((.*)\) Tj ET/g)].map(m=>({size:+m[1],x:+m[2],y:+m[3],text:m[4].replaceAll('\\200','€')}));
test('euro glyph is encoded as WinAnsi and all money columns align at a shared right edge',async()=>{
  const pdf=await buildTableReportPdf(admin,'Bedragen','November',[{title:'Twee geldkolommen',headers:['Naam','Grondslag','Btw'],widths:[250,130,131],rows:[['Factuur',money.format(9),money.format(1.89)],['Credit',money.format(-12345.67),money.format(-2592.59)],['Totaal',money.format(-12336.67),money.format(-2590.70)]]}]).text();
  assert.ok(pdf.includes('/WinAnsiEncoding'));assert.ok(pdf.includes('\\200'));assert.ok(!pdf.includes('EUR'));assert.ok(!pdf.includes('€'));
  const amounts=commands(pdf).filter(c=>c.text.includes('€'));
  assert.equal(amounts.length,6);
  for(let column=0;column<2;column++){
    const ends=amounts.filter((_,i)=>i%2===column).map(c=>c.x+reportTextWidth(c.text,c.size));
    assert.ok(Math.max(...ends)-Math.min(...ends)<0.002);
  }
});
test('landscape booking PDF keeps dates, amounts, credits and reverse-charge information',async()=>{
  const pdf=await context.buildEntriesPdf(admin,entries,'November').text();
  assert.ok(pdf.includes('/MediaBox [0 0 842 595]'));
  for(const s of ['01-11-2026','15-11-2026','12.345,67','-25,00','2.592,59','verlegd naar client','CREDIT-003'])assert.ok(pdf.includes(s),s);
  const text=commands(pdf);assert.equal(text.filter(c=>c.text==='€ 0,00').length,1);
  assert.ok(text.every(c=>c.x>=42&&c.x+reportTextWidth(c.text,c.size)<=800.01));
});
test('VAT PDF begins with balance and preserves 2a and deductible 5b with optional international sections',async()=>{
  const overview=context.buildVatOverview(entries,50);
  const pdf=await context.buildVatOverviewPdf(admin,overview,'November').text();
  assert.ok(pdf.indexOf('(Saldo btw)')<pdf.indexOf('(Nederlandse btw-aangifte'));
  for(const amount of [overview.vatDueTotal,overview.deductibleInputVatTotal,Math.abs(overview.vatBalance)])assert.ok(pdf.includes(reportPdfText(money.format(amount)).replace('€','\\200')));
  assert.ok(pdf.includes('(2a)'));assert.ok(pdf.includes('(5b)'));assert.ok(!pdf.includes('ICP-specificatie'));assert.ok(!pdf.includes('Buitenlandse btw en OSS'));
  const eu={...entries[0],vatRate:0,salesVat:{treatment:'eu_services',country:'DE',customerVatId:'DE123456789',serviceDate:'2026-11-01'}};
  const euPdf=await context.buildVatOverviewPdf(admin,context.buildVatOverview([eu]),'November').text();
  assert.ok(euPdf.includes('ICP-specificatie'));assert.ok(euPdf.includes('DE123456789'));assert.ok(euPdf.includes('Verschil met rubriek 3b'));
});
test('multi-page rows retain every word and repeat table headers without drawing below the footer',async()=>{
  const tokens=Array.from({length:500},(_,i)=>`woord${String(i).padStart(3,'0')}`);
  const pdf=await buildTableReportPdf(admin,'Lange omschrijvingen','Jaar',[{title:'Specificatie',headers:['Omschrijving','Bedrag'],widths:[300,211],rows:[[tokens.join(' '),money.format(123456789.01)]]}]).text();
  assert.ok((pdf.match(/\/Type \/Page\b/g)||[]).length>1);
  for(const token of tokens)assert.ok(pdf.includes(token),token);
  assert.ok((pdf.match(/\(Omschrijving\)/g)||[]).length>1);
  assert.ok(commands(pdf).filter(c=>c.y!==26).every(c=>c.y>=58));
});
if(process.env.REPORT_PDF_QA_DIR){
  mkdirSync(process.env.REPORT_PDF_QA_DIR,{recursive:true});
  for(const [name,blob] of [['boekingen',context.buildEntriesPdf(admin,[...entries,...entries,...entries],'November')],['btw',context.buildVatOverviewPdf(admin,context.buildVatOverview(entries,50),'November')]])writeFileSync(`${process.env.REPORT_PDF_QA_DIR}/${name}.pdf`,new Uint8Array(await blob.arrayBuffer()));
}
