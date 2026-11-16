import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as international from '../app/lib/international-vat.ts';
import * as expense from '../app/lib/expense-tax.ts';
import * as dates from '../app/lib/vat-period.ts';
import * as sales from '../app/lib/sales-invoice-lines.ts';
const source=ts.createSourceFile('page.tsx',readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const functionNames=['parseDecimal','parseAmountInput','parseOptionalAmountInput','getValidInvoiceVatLines','isValidBookingAmount','getEntryTotalInclVat','getEntryVatAmount','formatDecimalInput','createInvoiceVatLine','calculateInvoiceVatLineTotal','roundCents','invoiceExpenseTax','calculateInclusiveAmountInput','calculateExclusiveAmountInput','salesDraftLines'];
const functions=source.statements.filter(n=>ts.isFunctionDeclaration(n)&&functionNames.includes(n.name?.text)).map(n=>n.getText(source));
const handlers=[];function visit(n){if(ts.isVariableDeclaration(n)&&['addEntry','bookInvoiceDrafts','editEntry'].includes(n.name.getText(source)))handlers.push(`const ${n.getText(source)};`);ts.forEachChild(n,visit);}visit(source);
function harness(split=false){
  const state={error:'',saved:null};let id=0;
  const line=(amount,rate,id)=>({id,category:'Kosten',amount,vatRate:rate});
  const form={category:'Kosten',purchaseVat:'nl_reverse',type:'expense',date:'2026-02-15',vatDate:'invoice',invoiceNumber:'INK-1',relation:'Voorbeeldleverancier',description:'Onderaanneming',amount:'1000',amountInclVat:'1000',vatRate:'21',vatLines:split?[line('900','21','l1'),line('100','9','l2')]:[line('1000','21','l1')],status:'open',paidDate:'',paymentMethod:'company',rcDga:'',wkrType:'none',wkrValue:'',expenseTaxRule:'standard',inputVatBlocked:false,nonDeductibleAmount:'',nonDeductibleNote:'',depreciationYears:'none',loanInterestType:'manual',salesVat:{...international.emptySalesVat}};
  const draft={...form,id:'draft',documentId:'original-doc',selected:true,source:'handmatig'};
  const context={...international,...expense,...dates,...sales,
    active:{id:'a',fiscalYear:2026,entries:[]},entryForm:form,emptyEntry:{...form,purchaseVat:''},entryUsesSplitVatLines:split,editingEntryId:null,editedSalesEntry:undefined,retainedInvoiceVatAmount:undefined,entryTaxBase:1000,entryTaxVat:split?198:210,vatDeductionPercent:100,period:'q1',salesInvoiceNumber:'INK-1',duplicateSalesInvoiceNumber:false,
    entryCategories:{income:['Omzet'],expense:['Kosten']},loanCategory:'Financiering',bookableInvoiceDrafts:[draft],today:'2026-02-15',uid:()=>`new-${++id}`,
    setEntryVatError:e=>state.error=e,updateActive:a=>{state.saved=a;context.active=a;},setEntryForm:f=>context.entryForm=f,setEditingEntryId:id=>context.editingEntryId=id,setInvoiceDrafts:()=>{},setInvoiceImportStatus:e=>state.importStatus=e,setTab:()=>{},setSaveStatus:()=>{},
  };
  const code=ts.transpileModule([...functions,...handlers,'globalThis.add=addEntry;globalThis.book=bookInvoiceDrafts;globalThis.edit=editEntry;'].join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(code,context);return {state,context};
}
for(const split of [false,true])test(`actual ${split?'split':'single'} manual and imported booking preserve reverse charge and supplier amount`,()=>{
  for(const action of ['add','book']){
    const h=harness(split);h.context[action]({preventDefault(){}});
    assert.ok(h.state.saved,h.state.error||h.state.importStatus);
    const rows=h.state.saved.entries;
    assert.equal(rows.length,split?2:1);
    assert.ok(rows.every(e=>e.purchaseVat==='nl_reverse'&&e.inputVatAmount===0));
    assert.equal(rows.reduce((s,e)=>s+e.amount+international.invoicedVat(e),0),1000);
    assert.equal(rows.reduce((s,e)=>s+expense.deductibleExpenseVat(e),0),split?198:210);
    if(action==='book')assert.ok(rows.every(e=>e.documentId==='original-doc'));
    const stored=JSON.parse(JSON.stringify(rows[0]));h.context.edit(stored);
    assert.equal(h.context.entryForm.purchaseVat,'nl_reverse');assert.equal(Number(h.context.entryForm.amountInclVat.replace(',','.')),stored.amount);
  }
});
test('manual reverse-charge booking refuses 0% and deferred tax dates',()=>{
  const zero=harness();zero.context.entryForm.vatRate='0';zero.context.add({preventDefault(){}});assert.equal(zero.state.saved,null);assert.match(zero.state.error,/rekentarief/);
  const shifted=harness();shifted.context.entryForm.vatDate='2026-07-01';shifted.context.add({preventDefault(){}});assert.equal(shifted.state.saved,null);assert.match(shifted.state.error,/oorspronkelijke tijdvak/);
});
