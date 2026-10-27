import assert from "node:assert/strict";
import test from "node:test";
import { newEmployeeInput,markEmployeeSalaryPaid,calculateEmployeePayroll,employeePayrollErrors,employeeSalary,employeeExpenseEntry,employeeJournal,employeePayslipSections,whiteMonthly2026,statutoryMinimum } from "../app/lib/employee-payroll.ts";
import { companyCashAmount,operatingEntries,vatEntries,payrollSupplement,salaryDeclarationProposal,syncDeclarationEntries } from "../app/lib/payroll-accounting.ts";
const input=(extra={})=>({...newEmployeeInput(2026),employeeId:"e",name:"Medewerker Test",employeeNumber:"001",birthDate:"1990-02-01",address:"Straat 1",employerName:"Werk BV",employerAddress:"Laan 1",wageTaxNumber:"123L01",period:"2026-01",startDate:"2026-01-01",contractHours:40,paidHours:173.33,minimumHourly:14.71,baseSalary:3000,pensionFund:"Fonds",pensionReference:"Reglement / franchise verwerkt",pensionEmployeeAmount:150,pensionEmployerAmount:250,premiumReference:"Beschikking Whk 2026; Aof klein; AWf hoog",standardTaxConfirmed:true,reviewed:true,...extra});
const record=(i,id="s",prior=[])=>employeeSalary(id,i,calculateEmployeePayroll(i,prior));
const cents=n=>Math.round(n*100);

test("official monthly table anchors, lower row selection and employee-favourable top extension",()=>{
 assert.deepEqual(whiteMonthly2026(6264,true),{tax:1963.25,credit:313.33,tableWage:6264});
 assert.deepEqual(whiteMonthly2026(2850,true),{tax:327.17,credit:455.25,tableWage:2848.5});
 assert.deepEqual(whiteMonthly2026(4.49,false),{tax:0,credit:0,tableWage:0});
 assert.equal(whiteMonthly2026(4.5,false).tax,1.58);
 assert.equal(whiteMonthly2026(2850,false).credit,0);
 assert.equal(whiteMonthly2026(11092.51,true).tax,4651.67);
 assert.equal(whiteMonthly2026(11093.5,true).tax,4652.16);
 assert.throws(()=>whiteMonthly2026(NaN,true));
});
test("employee pension reduces uniform wages; employer Zvw and pension do not reduce net wages",()=>{
 const i=input(), r=calculateEmployeePayroll(i,[]);
 assert.deepEqual(employeePayrollErrors(i,r,[]),[]);
 assert.equal(r.fiscalWage,2850);assert.equal(r.svWage,2850);assert.equal(r.zvw,173.85);
 assert.equal(r.net,2522.83);assert.equal(r.pensionTotal,400);assert.equal(r.employerCost,4077.39);
 assert.equal(r.insurance,413.54);assert.equal(r.holidayAccrual,240);
});
test("pension rate mode uses supplied post-franchise part-time base, not gross wage",()=>{
 const r=calculateEmployeePayroll(input({pensionMode:"rate",pensionBasis:1200,pensionEmployeeRate:10,pensionEmployerRate:15}),[]);
 assert.equal(r.pensionEmployee,120);assert.equal(r.pensionEmployer,180);assert.equal(r.fiscalWage,2880);
});
test("monthly holiday pay and annual reserve release are taxed and expensed exactly once",()=>{
 const monthly=calculateEmployeePayroll(input({holidayMode:"monthly"}),[]);
 assert.equal(monthly.gross,3240);assert.equal(monthly.holidayAccrual,0);assert.equal(monthly.holidayBalance,0);
 const jan=record(input());const febInput=input({period:"2026-02",holidayRelease:480,specialRate:40,specialReference:"Jaarloon en bijzondere tabel gecontroleerd"});
 const feb=calculateEmployeePayroll(febInput,[jan]);
 assert.equal(feb.gross,3480);assert.equal(feb.holidayAccrual,240);assert.equal(feb.holidayBalance,0);assert.equal(feb.specialTaxable,480);
 assert.equal(cents(feb.employerCost-feb.pensionEmployer-feb.zvw-feb.insurance),324000);
 assert.deepEqual(employeePayrollErrors(febInput,feb,[jan]),[]);
 const excessive=calculateEmployeePayroll({...febInput,holidayRelease:481},[jan]);
 assert.ok(employeePayrollErrors({...febInput,holidayRelease:481},excessive,[jan]).some(e=>e.includes("reserve")));
});
test("VCR catches up after a high-pay month rather than separately capping each month",()=>{
 const jan=record(input({baseSalary:10000}));assert.equal(jan.employeePayroll.result.premiumBase,6617.41);
 const i=input({period:"2026-02",baseSalary:2000,paidHours:100});const r=calculateEmployeePayroll(i,[jan]);
 assert.equal(r.svWage,1850);assert.equal(r.premiumBase,5082.59);assert.equal(r.zvw,310.04);
});
test("VCR validates missing periods, migration opening balances and stable openings",()=>{
 const i=input({period:"2026-10",minimumHourly:14.99});const r=calculateEmployeePayroll(i,[]);
 assert.ok(employeePayrollErrors(i,r,[]).some(e=>e.includes("aaneensluitende")));
 const opening={...i,openingPeriods:9,openingSvWage:25650,openingPremiumBase:25650};
 assert.deepEqual(employeePayrollErrors(opening,calculateEmployeePayroll(opening,[]),[]),[]);
 const jan=record(input());const feb=input({period:"2026-02",openingSvWage:1});
 assert.ok(employeePayrollErrors(feb,calculateEmployeePayroll(feb,[jan]),[jan]).some(e=>e.includes("Beginstanden")));
});
test("premiums require employer-specific review; contract, AOW and partial-month exceptions block automatic mode",()=>{
 for(const changes of [{premiumReference:""},{awfRate:2.74,indefinite:false},{startDate:"2026-01-15"},{birthDate:"1958-01-15"},{reviewed:false},{pensionReference:""},{pensionMode:"none",pensionReference:""}]){
 const i=input(changes);assert.ok(employeePayrollErrors(i,calculateEmployeePayroll(i,[]),[]).length,JSON.stringify(changes));
 }
 const i=input({startDate:"2026-01-15",taxMode:"manual",taxReference:"Witte dagtabel voor gedeeltelijk tijdvak",premiumMode:"manual",manualWageTax:327.17,manualLaborCredit:455.25,manualZvw:173.85,manualAwf:220.59,manualAof:178.70,manualWhk:0,manualWko:14.25});
 assert.deepEqual(employeePayrollErrors(i,calculateEmployeePayroll(i,[]),[]),[]);
});
test("minimum hourly wage changes in July and by age; invalid and under-minimum wages blocked",()=>{
 assert.equal(statutoryMinimum("1990-01-01","2026-06"),14.71);assert.equal(statutoryMinimum("1990-01-01","2026-07"),14.99);
 assert.equal(statutoryMinimum("2006-01-01","2026-10"),11.99);assert.equal(statutoryMinimum("1990-01-01","2027-01"),0);
 const i=input({baseSalary:2000});assert.ok(employeePayrollErrors(i,calculateEmployeePayroll(i,[]),[]).some(e=>e.includes("minimumuurloon ×")));
 const birthday=input({birthDate:"2005-01-15"});assert.ok(employeePayrollErrors(birthday,calculateEmployeePayroll(birthday,[]),[]).some(e=>e.includes("jarig")));
});
test("all journal entries balance with pension, reserve, net allowance, deductions and negative premium correction",()=>{
 for(const extra of [{},{netAllowance:150,netDeduction:50},{premiumMode:"manual",manualZvw:-1,manualAwf:-2,manualAof:0,manualWhk:0,manualWko:0}]){
 const s=record(input(extra)), lines=employeeJournal(s.employeePayroll);
 assert.equal(cents(lines.reduce((n,l)=>n+l.debit,0)),cents(lines.reduce((n,l)=>n+l.credit,0)));
 assert.equal(cents(lines.filter(l=>!l.account.startsWith("Te betalen") && !l.account.startsWith("Overige inhoudingen") && l.account!=="Reserve vakantiegeld").reduce((n,l)=>n+l.debit-l.credit,0)),cents(s.employeePayroll.result.employerCost));
 }
});
test("final payroll expense and declaration adjustment include employer premiums once; settlements have no VAT/cost",()=>{
 const s=record(input()), expense=employeeExpenseEntry(s); const r=s.employeePayroll.result;
 const d={id:"d",period:s.period,wageTax:r.wageTax,dgaZvw:0,employerZvw:r.zvw,employeeInsurance:r.insurance,endLevy:0,correction:0,reference:"",filedDate:"",processed:true,payments:[]};
 const a={id:"a",name:"BV",fiscalYear:2026,salaries:[s],entries:[expense]};
 assert.equal(salaryDeclarationProposal([s],s.period).employeeInsurance,r.insurance);assert.equal(payrollSupplement(d,[s]),0);
 const once=syncDeclarationEntries(a,d,true);assert.deepEqual(syncDeclarationEntries({...a,entries:once},d,true),once);
 const payment={...expense,id:"payment",salaryRecordId:undefined,amount:400,balanceOnly:true,payrollSettlement:"pension"};
 assert.equal(operatingEntries([expense,payment]).length,1);assert.equal(vatEntries([expense,payment]).length,0);
 assert.equal(companyCashAmount(expense),r.net);
 assert.equal(employeeExpenseEntry(s,"stable-id").id,"stable-id");
});
test("duplicates and edits affecting later periods rejected, but last-period correction allowed",()=>{
 const jan=record(input());const feb=record(input({period:"2026-02"}),"feb",[jan]);
 assert.ok(employeePayrollErrors(input(),jan.employeePayroll.result,[jan]).some(e=>e.includes("bestaat al")));
 assert.ok(employeePayrollErrors(input(),jan.employeePayroll.result,[jan,feb],jan.id).some(e=>e.includes("latere")));
 assert.deepEqual(employeePayrollErrors(feb.employeePayroll.input,feb.employeePayroll.result,[jan,feb],feb.id),[]);
});
test("payslip snapshot includes mandatory contract and minimum-wage information and actual fiscal cumulatives",()=>{
 const jan=record(input());const i=input({period:"2026-02"});const feb=record(i,"feb",[jan]);
 const sections=employeePayslipSections(feb,[jan,feb]); const text=JSON.stringify(sections);
 for(const value of ["Medewerker Test","Schriftelijk / onbepaalde tijd / oproep","Contracturen per week","Verloonde uren","minimumuurloon","Pensioen werknemer","Werkgeversheffing Zvw","Fiscaal loon cumulatief"])assert.ok(text.includes(value),value);
 assert.equal(sections.at(-1).rows.find(r=>r[0]==="Fiscaal loon cumulatief")[1],new Intl.NumberFormat("nl-NL",{style:"currency",currency:"EUR"}).format(5700));
});

test("custom holiday base can include a bonus while retaining special tax treatment",()=>{
 const i=input({specialGross:1000,specialRate:40,specialReference:"Gecontroleerd bijzonder tarief",holidayUseCustomBasis:true,holidayBasis:4000,holidayBasisReference:"Cao: bonus telt mee"});
 const r=calculateEmployeePayroll(i,[]);assert.equal(r.holidayAccrual,320);assert.equal(r.specialTaxable,1000);assert.equal(r.wageTax,727.17);assert.deepEqual(employeePayrollErrors(i,r,[]),[]);
});

test("paying a final wage period synchronises the snapshot and cash entry without changing calculation or VCR",()=>{
 const original=record(input());const paid=markEmployeeSalaryPaid(original,"2026-02-05");
 assert.equal(paid.status,"paid");assert.equal(paid.employeePayroll.input.status,"paid");assert.equal(paid.employeePayroll.input.paymentDate,"2026-02-05");
 assert.deepEqual(paid.employeePayroll.result,original.employeePayroll.result);assert.equal(employeeExpenseEntry(paid).paidDate,"2026-02-05");
 assert.equal(employeeExpenseEntry(paid).cashAmount,original.netSalary);assert.throws(()=>markEmployeeSalaryPaid(original,"2026-02-31"));
});
