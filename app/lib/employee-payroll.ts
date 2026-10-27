import { whiteMonth2026 } from "./white-month-2026.ts";
import type { FinanceEntry, FinanceSection } from "./payroll-accounting";

const round = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const euro = (v: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(v);
export const payrollSources = {
  table: "https://download.belastingdienst.nl/belastingdienst/dl/rekenhulpen/loonheffing/2026/v01/pdf/wit_mnd_nl_std_20260101.pdf",
  handbook: "https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/themaoverstijgend/brochures_en_publicaties/handboek-loonheffingen",
  minimum: "https://www.rijksoverheid.nl/themas/werk/minimumloon/bedragen-minimumloon/bedragen-minimumloon-2026",
};
export type EmployeeInput = {
  employeeId: string; employeeNumber: string; name: string; birthDate: string; address: string;
  employerName: string; employerAddress: string; wageTaxNumber: string; iban: string;
  period: string; startDate: string; endDate: string; paymentDate: string;
  written: boolean; indefinite: boolean; onCall: boolean; contractHours: number; paidHours: number;
  minimumHourly: number; minimumExplanation: string;
  baseSalary: number; extraGross: number; extraLabel: string; specialGross: number; specialLabel: string;
  holidayMode: "reserve" | "monthly"; holidayRate: number; holidayRelease: number; holidayOpening: number;
  holidayException: string; holidayUseCustomBasis: boolean; holidayBasis: number; holidayBasisReference: string;
  pensionMode: "none" | "amount" | "rate"; pensionFund: string; pensionBasis: number;
  pensionEmployeeRate: number; pensionEmployerRate: number; pensionEmployeeAmount: number; pensionEmployerAmount: number;
  pensionEmployeeSpecial: number; pensionReference: string;
  taxMode: "table2026" | "manual"; taxCredit: boolean; standardTaxConfirmed: boolean;
  specialRate: number; specialReference: string; manualWageTax: number; manualLaborCredit: number; taxReference: string;
  premiumMode: "vcr2026" | "manual"; awfRate: number; aofRate: number; whkRate: number; wkoRate: number;
  premiumReference: string; openingPeriods: number; openingSvWage: number; openingPremiumBase: number;
  manualZvw: number; manualAwf: number; manualAof: number; manualWhk: number; manualWko: number;
  netAllowance: number; allowanceLabel: string; netDeduction: number; deductionLabel: string;
  status: "open" | "paid"; reviewed: boolean;
};
export type EmployeeResult = {
  gross: number; holidayPaid: number; holidayAccrual: number; holidayBalance: number;
  pensionEmployee: number; pensionEmployer: number; pensionTotal: number;
  regularTaxable: number; specialTaxable: number; fiscalWage: number; svWage: number;
  premiumBase: number; zvw: number; awf: number; aof: number; whk: number; wko: number; insurance: number;
  wageTax: number; laborCredit: number; net: number; employerCost: number; tableWage: number;
};
export type EmployeePayroll = { input: EmployeeInput; result: EmployeeResult; finalizedAt: string };
export type EmployeeSalary = {
  id: string; employeeId?: string; employeeName: string; employeeBirthDate?: string; employeeAddress?: string;
  period: string; grossSalary: number; wageTax: number; netSalary: number; employerHealthContribution: number;
  zvwContributionType?: "dga_contribution" | "employer_levy"; status: "paid" | "open"; paymentDate: string;
  employeePayroll?: EmployeePayroll;
};
export type EmployeeDraft = { id: string; salaryId?: string; input: EmployeeInput };
export function newEmployeeInput(year: number): EmployeeInput {
  return {
    employeeId: "", employeeNumber: "", name: "", birthDate: "", address: "", employerName: "", employerAddress: "", wageTaxNumber: "", iban: "",
    period: `${year}-${new Date().toLocaleDateString("sv-SE").slice(5, 7)}`, startDate: "", endDate: "", paymentDate: "",
    written: true, indefinite: false, onCall: false, contractHours: 0, paidHours: 0, minimumHourly: 0, minimumExplanation: "",
    baseSalary: 0, extraGross: 0, extraLabel: "Toeslag / overwerk", specialGross: 0, specialLabel: "Bonus", holidayMode: "reserve", holidayRate: 8, holidayRelease: 0, holidayOpening: 0, holidayException: "", holidayUseCustomBasis: false, holidayBasis: 0, holidayBasisReference: "",
    pensionMode: "amount", pensionFund: "", pensionBasis: 0, pensionEmployeeRate: 0, pensionEmployerRate: 0, pensionEmployeeAmount: 0, pensionEmployerAmount: 0, pensionEmployeeSpecial: 0, pensionReference: "",
    taxMode: year === 2026 ? "table2026" : "manual", taxCredit: true, standardTaxConfirmed: false, specialRate: 0, specialReference: "", manualWageTax: 0, manualLaborCredit: 0, taxReference: "",
    premiumMode: year === 2026 ? "vcr2026" : "manual", awfRate: 7.74, aofRate: 6.27, whkRate: 0, wkoRate: 0.5, premiumReference: "", openingPeriods: 0, openingSvWage: 0, openingPremiumBase: 0,
    manualZvw: 0, manualAwf: 0, manualAof: 0, manualWhk: 0, manualWko: 0,
    netAllowance: 0, allowanceLabel: "Onbelaste kostenvergoeding", netDeduction: 0, deductionLabel: "Overige netto inhouding", status: "open", reviewed: false,
  };
}
export function ageOn(birthDate: string, date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NaN;
  return Number(date.slice(0, 4)) - Number(birthDate.slice(0, 4)) - (date.slice(5) < birthDate.slice(5) ? 1 : 0);
}
export function statutoryMinimum(birthDate: string, period: string) {
  if (!period.startsWith("2026-")) return 0;
  const age = ageOn(birthDate, `${period}-01`);
  const jan = [4.41, 5.07, 5.81, 7.36, 8.83, 11.77, 14.71];
  const jul = [4.50, 5.17, 5.92, 7.50, 8.99, 11.99, 14.99];
  return age >= 15 ? (Number(period.slice(5)) >= 7 ? jul : jan)[Math.min(age, 21) - 15] : 0;
}
export function whiteMonthly2026(wage: number, credit: boolean) {
  if (!Number.isFinite(wage) || wage < 0) throw new Error("Ongeldig tabelloon.");
  const wageCents = Math.round(wage * 100);
  const last = whiteMonth2026[whiteMonth2026.length - 1];
  const index = Math.floor(wageCents / 450) - 1;
  const row = index < 0 ? [0, 0, 0, 0] : whiteMonth2026[Math.min(index, whiteMonth2026.length - 1)];
  const excess = Math.max(0, wageCents - last[0]);
  // Published instruction: 49.50% above the last row, rounded in the employee's favour.
  return { tax: round((row[credit ? 2 : 1] + Math.floor(excess * 0.495 + 1e-8)) / 100), credit: credit ? row[3] / 100 : 0, tableWage: row[0] / 100 };
}
export function earlierSalaries(input: EmployeeInput, salaries: EmployeeSalary[]) {
  return salaries.filter(s => s.employeeId === input.employeeId && s.period.slice(0, 4) === input.period.slice(0, 4) && s.period < input.period && s.employeePayroll);
}
export function calculateEmployeePayroll(input: EmployeeInput, salaries: EmployeeSalary[]): EmployeeResult {
  const prior = earlierSalaries(input, salaries);
  const sum = (field: keyof EmployeeResult) => prior.reduce((n, s) => n + (s.employeePayroll?.result[field] ?? 0), 0);
  const holidayBasis = input.holidayUseCustomBasis ? input.holidayBasis : input.baseSalary + input.extraGross;
  const holidayAccrual = input.holidayMode === "reserve" ? round(holidayBasis * input.holidayRate / 100) : 0;
  const monthlyHoliday = input.holidayMode === "monthly" ? round(holidayBasis * input.holidayRate / 100) : 0;
  const holidayPaid = round(monthlyHoliday + input.holidayRelease);
  const gross = round(input.baseSalary + input.extraGross + input.specialGross + holidayPaid);
  const pensionEmployee = input.pensionMode === "none" ? 0 : input.pensionMode === "amount" ? input.pensionEmployeeAmount : round(input.pensionBasis * input.pensionEmployeeRate / 100);
  const pensionEmployer = input.pensionMode === "none" ? 0 : input.pensionMode === "amount" ? input.pensionEmployerAmount : round(input.pensionBasis * input.pensionEmployerRate / 100);
  const specialTaxable = round(input.specialGross + input.holidayRelease - input.pensionEmployeeSpecial);
  const regularTaxable = round(input.baseSalary + input.extraGross + monthlyHoliday - pensionEmployee + input.pensionEmployeeSpecial);
  const fiscalWage = round(gross - pensionEmployee);
  const svWage = fiscalWage;
  const periods = new Set(prior.map(s => s.period)).size + input.openingPeriods + 1;
  const cumulativeSvWage = round(input.openingSvWage + sum("svWage") + svWage);
  // Monthly ceiling from the official 2026 contribution table, not annual maximum / 12 rounded up.
  const cumulativeBase = Math.min(cumulativeSvWage, round(periods * 6617.41), 79409);
  const premiumBase = round(cumulativeBase - input.openingPremiumBase - sum("premiumBase"));
  const calc = (rate: number, manual: number) => input.premiumMode === "vcr2026" ? round(premiumBase * rate / 100) : manual;
  const zvw = calc(6.10, input.manualZvw), awf = calc(input.awfRate, input.manualAwf), aof = calc(input.aofRate, input.manualAof), whk = calc(input.whkRate, input.manualWhk), wko = calc(input.wkoRate, input.manualWko);
  const insurance = round(awf + aof + whk + wko);
  const table = whiteMonthly2026(Math.max(0, regularTaxable), input.taxCredit);
  const wageTax = input.taxMode === "table2026" ? round(table.tax + specialTaxable * input.specialRate / 100) : input.manualWageTax;
  const laborCredit = input.taxMode === "table2026" ? table.credit : input.manualLaborCredit;
  const net = round(gross - pensionEmployee - wageTax + input.netAllowance - input.netDeduction);
  const employerCost = round(gross - input.holidayRelease + holidayAccrual + pensionEmployer + zvw + insurance + input.netAllowance);
  return { gross, holidayPaid, holidayAccrual, holidayBalance: round(input.holidayOpening + sum("holidayAccrual") - prior.reduce((n,s) => n + (s.employeePayroll?.input.holidayRelease ?? 0),0) + holidayAccrual - input.holidayRelease), pensionEmployee: round(pensionEmployee), pensionEmployer: round(pensionEmployer), pensionTotal: round(pensionEmployee + pensionEmployer), regularTaxable, specialTaxable, fiscalWage, svWage, premiumBase, zvw, awf, aof, whk, wko, insurance, wageTax, laborCredit, net, employerCost, tableWage: table.tableWage };
}
export function employeePayrollErrors(i: EmployeeInput, r: EmployeeResult, salaries: EmployeeSalary[], editingId?: string) {
  const errors: string[] = [];
  const prior = earlierSalaries(i,salaries);
  const lastDay = new Date(Number(i.period.slice(0,4)),Number(i.period.slice(5)),0).getDate();
  const periodEnd = `${i.period}-${lastDay}`;
  const validDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0,10) === date;
  if (![i.birthDate,i.startDate,...(i.endDate?[i.endDate]:[]),...(i.paymentDate?[i.paymentDate]:[])].every(validDate) || i.birthDate >= i.startDate) errors.push("Controleer de geboortedatum, in-/uitdienstdata en betaaldatum.");
  if (i.period.slice(0,4) !== "2026" && (i.taxMode === "table2026" || i.premiumMode === "vcr2026")) errors.push("Voor dit jaar zijn gecontroleerde loonheffing en premies vereist.");
  if ([i.pensionEmployeeRate,i.pensionEmployerRate,i.specialRate,i.whkRate].some(v=>v>100)) errors.push("Een premie- of belastingpercentage kan niet hoger zijn dan 100%.");
  if (prior.some(s=>s.employeePayroll && (["openingPeriods","openingSvWage","openingPremiumBase","holidayOpening"] as const).some(k=>s.employeePayroll!.input[k]!==i[k]))) errors.push("Beginstanden moeten aansluiten op de eerdere loonstroken van dit kalenderjaar.");
  if (i.birthDate.slice(5,7) === i.period.slice(5,7) && ageOn(i.birthDate,periodEnd)>=15 && ageOn(i.birthDate,periodEnd)<=21 && ageOn(i.birthDate,`${i.period}-01`)!==ageOn(i.birthDate,periodEnd) && !i.minimumExplanation.trim()) errors.push("De medewerker is deze maand jarig: controleer de minimumloonwijziging op de verjaardag en leg de urenverdeling vast.");
  if (!i.employeeId || !i.name.trim() || !i.birthDate || !i.address.trim() || !i.employeeNumber.trim()) errors.push("Kies een medewerker en vul naam, geboortedatum, adres en personeelsnummer in.");
  if (!i.employerName.trim() || !i.employerAddress.trim() || !i.wageTaxNumber.trim()) errors.push("Vul de werkgeversnaam, het werkgeversadres en loonheffingennummer in.");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(i.period) || !i.startDate || i.startDate > `${i.period}-31` || (i.endDate && (i.endDate < i.startDate || i.endDate < `${i.period}-01`))) errors.push("Controleer de loonperiode en in- en uitdienstdata.");
  if (i.status === "paid" && !i.paymentDate) errors.push("Vul de werkelijke betaaldatum in voor een betaald salaris.");
  if (i.contractHours <= 0 || i.paidHours <= 0 || i.minimumHourly <= 0 || i.baseSalary <= 0) errors.push("Vul contracturen per week, verloonde uren, minimumuurloon en een positief basisloon in.");
  if (i.baseSalary + i.extraGross + 0.01 < i.minimumHourly * i.paidHours) errors.push("Loon exclusief vakantiebijslag ligt onder het minimumuurloon × verloonde uren; controleer uren en loon.");
  if (Object.values(i).some(v => typeof v === "number" && !Number.isFinite(v))) errors.push("Alle getallen moeten geldig zijn.");
  const signedFields = new Set(["manualZvw", "manualAwf", "manualAof", "manualWhk", "manualWko"]);
  if (Object.entries(i).some(([k,v]) => typeof v === "number" && v < 0 && !signedFields.has(k))) errors.push("Gebruik geen negatieve bedragen; verwerk correcties in het oorspronkelijke tijdvak.");
  if (i.holidayUseCustomBasis && !i.holidayBasisReference.trim()) errors.push("Documenteer de afwijkende vakantiegeldgrondslag volgens de arbeidsovereenkomst/cao.");
  if (i.holidayRate < 8 && !i.holidayException.trim()) errors.push("Minder dan 8% vakantiebijslag vereist een onderbouwde wettelijke uitzondering.");
  if (r.holidayBalance < -0.01) errors.push("De uitbetaling vakantiegeld is hoger dan de vastgelegde reserve; vul de beginreserve in of herstel de opbouw.");
  if (i.pensionMode !== "none" && (!i.pensionFund.trim() || !i.pensionReference.trim())) errors.push("Leg pensioenuitvoerder en regeling/grondslag vast, inclusief franchise en deeltijd indien van toepassing.");
  if (i.pensionMode === "none" && !i.pensionReference.trim()) errors.push("Leg vast waarom geen pensioenregeling geldt.");
  if (i.pensionEmployeeSpecial > r.pensionEmployee || r.regularTaxable < 0 || r.specialTaxable < 0) errors.push("De pensioeninhouding en verdeling over regulier en bijzonder loon sluiten niet aan.");
  if (!i.extraLabel.trim() && i.extraGross || !i.specialLabel.trim() && i.specialGross || !i.allowanceLabel.trim() && i.netAllowance || !i.deductionLabel.trim() && i.netDeduction) errors.push("Omschrijf alle loonbestanddelen en inhoudingen.");
  if (r.net < 0 || r.wageTax > r.fiscalWage || r.laborCredit > r.fiscalWage) errors.push("Controleer loonheffing, arbeidskorting en netto loon.");
  if (i.taxMode === "table2026") {
    if (!i.period.startsWith("2026-") || !i.standardTaxConfirmed || ageOn(i.birthDate, periodEnd) >= 67 || ageOn(i.birthDate, `${i.period}-01`) < 0) errors.push("Automatisch: uitsluitend standaard witte maandtabel 2026, Nederland, vóór AOW en volledig maandtijdvak; bevestig de situatie of kies gecontroleerde bedragen.");
    if (i.startDate > `${i.period}-01` || (i.endDate && i.endDate < periodEnd && i.endDate.slice(0,7) === i.period)) errors.push("Bij in-/uitdienst gedurende de maand is een afzonderlijke tijdvakbeoordeling nodig; gebruik gecontroleerde loonheffing.");
    if (r.specialTaxable > 0 && (!i.specialReference.trim() || i.specialRate > 100)) errors.push("Vul voor bijzonder loon het gecontroleerde bijzondere tarief en de grondslag/bron in.");
  } else if (!i.taxReference.trim()) errors.push("Vul de bron en toegepaste tabel voor de gecontroleerde loonheffing in.");
  if (!i.taxCredit && r.laborCredit !== 0) errors.push("Zonder loonheffingskorting moet verrekende arbeidskorting nul zijn.");
  if (!i.premiumReference.trim()) errors.push("Controleer en documenteer AWf, Aof en Whk aan de hand van contract, werkgeversgrootte en beschikking.");
  if (i.premiumMode === "vcr2026") {
    if (!i.period.startsWith("2026-") || ageOn(i.birthDate, periodEnd) >= 67 || i.startDate > `${i.period}-01` || (i.endDate && i.endDate < periodEnd && i.endDate.slice(0,7) === i.period)) errors.push("Automatische premies ondersteunen volledige maandtijdvakken 2026 vóór AOW. Gebruik anders gecontroleerde premiebedragen.");
    if (![2.74,7.74].includes(i.awfRate) || ![6.27,7.63].includes(i.aofRate) || i.wkoRate !== 0.5 || i.whkRate > 100) errors.push("Controleer de premietarieven voor 2026; kies gecontroleerde bedragen voor vrijstellingen of uitzonderingen.");
    if (i.awfRate === 2.74 && !(i.written && i.indefinite && !i.onCall)) errors.push("Lage AWf bij dit contract vereist een uitzondering; gebruik gecontroleerde premies en documenteer de uitzondering.");
    const firstMonth = i.startDate.slice(0,4) === i.period.slice(0,4) ? Number(i.startDate.slice(5,7)) : 1;
    const expectedPrior = Number(i.period.slice(5))-firstMonth;
    if (i.openingPeriods+new Set(prior.map(s=>s.period)).size!==expectedPrior || (i.startDate.slice(0,4)===i.period.slice(0,4) && i.startDate.slice(8)!=="01") || prior.some(s=>s.employeePayroll?.input.premiumMode!=="vcr2026")) errors.push("VCR vereist volledige, aaneensluitende maandtijdvakken en gecontroleerde beginstanden. Kies gecontroleerde premies bij ontbrekende/gedeeltelijke perioden of eerdere handmatige premies.");
    if (!Number.isInteger(i.openingPeriods) || i.openingPeriods + new Set(earlierSalaries(i,salaries).map(s=>s.period)).size >= Number(i.period.slice(5)) || i.openingPremiumBase > i.openingSvWage || i.openingPremiumBase > round(i.openingPeriods * 6617.41)) errors.push("Controleer de eerdere premietijdvakken en beginstanden; voorkom overlap met opgeslagen loonstroken.");
  }
  if (salaries.some(s => s.id !== editingId && s.employeeId === i.employeeId && s.period === i.period)) errors.push("Voor deze medewerker bestaat al een salaris in deze maand. Bewerk die loonstrook.");
  if (salaries.some(s => s.id !== editingId && s.employeeId === i.employeeId && s.period.slice(0,4) === i.period.slice(0,4) && s.period > i.period && s.employeePayroll)) errors.push("Er bestaan latere loonstroken. Verwijder en herbereken eerst die latere perioden om cumulatieven correct te houden.");
  const knownMinimum = statutoryMinimum(i.birthDate,i.period);
  if ((!knownMinimum || Math.abs(knownMinimum-i.minimumHourly)>0.001) && !i.minimumExplanation.trim()) errors.push("Documenteer het afwijkende minimumuurloon, bijvoorbeeld BBL, verjaardag of ander kalenderjaar.");
  if (!i.reviewed) errors.push("Controleer de berekening en bevestig de loon- en pensioeninstellingen vóór definitief maken.");
  return errors;
}
export function employeeSalary(id: string, input: EmployeeInput, result: EmployeeResult): EmployeeSalary {
  return { id, employeeId: input.employeeId, employeeName: input.name, employeeBirthDate: input.birthDate, employeeAddress: input.address,
    period: input.period, grossSalary: result.gross, wageTax: result.wageTax, netSalary: result.net, employerHealthContribution: result.zvw,
    zvwContributionType: "employer_levy", status: input.status, paymentDate: input.paymentDate,
    employeePayroll: { input: { ...input }, result: { ...result }, finalizedAt: new Date().toISOString() } };
}
export function employeeExpenseEntry(s: EmployeeSalary, existingId?: string): FinanceEntry {
  if (!s.employeePayroll) throw new Error("Geen medewerkerloonstrook.");
  const [y,m] = s.period.split("-").map(Number);
  return { id: existingId ?? `employee-payroll-${s.id}`, date: `${s.period}-${new Date(y,m,0).getDate()}`, description: `Medewerkersloon ${s.employeeName} ${s.period}`, relation: s.employeeName,
    category: "Lonen personeel en werkgeverslasten", type: "expense", amount: s.employeePayroll.result.employerCost, vatRate: 0, status: s.status,
    paidDate: s.status === "paid" ? s.paymentDate : undefined, cashAmount: s.netSalary, salaryRecordId: s.id };
}
export type JournalLine = { account: string; debit: number; credit: number };
export function employeeJournal(p: EmployeePayroll): JournalLine[] {
  const {input:i,result:r} = p;
  const line = (account: string, value: number, debit = false) => ({ account, debit: round((debit ? value : -value) > 0 ? Math.abs(value) : 0), credit: round((debit ? value : -value) < 0 ? Math.abs(value) : 0) });
  return [line("Brutolonen",r.gross,true), line("Mutatie vakantiegeldreserve (kosten)", r.holidayAccrual-i.holidayRelease,true), line("Werkgeverspremie pensioen",r.pensionEmployer,true), line("Werkgeversheffing Zvw",r.zvw,true), line("Premies werknemersverzekeringen",r.insurance,true), line(i.allowanceLabel,i.netAllowance,true),
    line("Te betalen netto lonen",r.net),line("Te betalen loonheffingen",r.wageTax+r.zvw+r.insurance),line(`Te betalen pensioen ${i.pensionFund}`,r.pensionTotal),line(`Overige inhoudingen: ${i.deductionLabel}`,i.netDeduction),line("Reserve vakantiegeld",r.holidayAccrual-i.holidayRelease)].filter(l=>l.debit || l.credit);
}
export function employeePayslipSections(s: EmployeeSalary, salaries: EmployeeSalary[]): FinanceSection[] {
  if (!s.employeePayroll) return [];
  const { input:i, result:r } = s.employeePayroll;
  const prior = earlierSalaries(i,salaries);
  const cum = (key: keyof EmployeeResult) => round(r[key]+prior.reduce((n,s)=>n+(s.employeePayroll?.result[key] ?? 0),0));
  const section = (title: string, rows: Array<Array<string | number>>): FinanceSection => ({title,headers:["Omschrijving","Gegeven / bedrag"],widths:[255,256],rows});
  return [section("Werkgever en medewerker",[["Werkgever",i.employerName],["Adres werkgever",i.employerAddress],["Loonheffingennummer",i.wageTaxNumber],["Medewerker",i.name],["Personeelsnummer",i.employeeNumber],["Adres medewerker",i.address],["Geboortedatum",i.birthDate],["IBAN medewerker",i.iban || "-"],["Loonperiode (maand)",i.period],["In dienst / uit dienst",`${i.startDate} / ${i.endDate || "-"}`],["Betaaldatum / status",`${s.paymentDate || "-"} / ${s.status === "paid" ? "Betaald" : "Open"}`]]),
    section("Arbeidsovereenkomst",[["Schriftelijk / onbepaalde tijd / oproep",`${i.written?"Ja":"Nee"} / ${i.indefinite?"Ja":"Nee"} / ${i.onCall?"Ja":"Nee"}`],["Contracturen per week",i.contractHours],["Verloonde uren deze maand",i.paidHours],["Toepasselijk minimumuurloon",euro(i.minimumHourly)],["Toelichting minimumloon",i.minimumExplanation || "Regulier wettelijk minimumuurloon"]]),
    section("Van bruto naar netto",[["Basisloon",euro(i.baseSalary)],...(i.extraGross?[[i.extraLabel,euro(i.extraGross)]]:[]),...(i.specialGross?[[i.specialLabel,euro(i.specialGross)]]:[]),["Vakantiebijslag uitbetaald",euro(r.holidayPaid)],["Totaal bruto loon",euro(r.gross)],[`Pensioen werknemer: ${i.pensionFund || "geen"}`,euro(-r.pensionEmployee)],["Fiscaal loon / SV-loon",euro(r.fiscalWage)],["Loonbelasting / premie volksverzekeringen",euro(-r.wageTax)],...(i.netAllowance?[[i.allowanceLabel,euro(i.netAllowance)]]:[]),...(i.netDeduction?[[i.deductionLabel,euro(-i.netDeduction)]]:[]),["Netto uit te betalen",euro(r.net)]]),
    section("Heffingen en pensioen",[["Loonheffingskorting",i.taxCredit?"Ja":"Nee"],["Tabel",i.taxMode === "table2026" ? "Wit / maand / Nederland / standaard 2026" : i.taxReference],["Tabelloon regulier",euro(i.taxMode === "table2026"?r.tableWage:r.regularTaxable)],["Verrekende arbeidskorting (in loonheffing)",euro(r.laborCredit)],["Bijzonder loon / tarief",`${euro(r.specialTaxable)} / ${i.specialRate}%`],["Pensioen werkgever (geen inhouding)",euro(r.pensionEmployer)],["Werkgeversheffing Zvw (geen inhouding)",euro(r.zvw)],["Grondslag premies / Zvw (VCR)",i.premiumMode === "vcr2026"?euro(r.premiumBase):"Gecontroleerde premiebedragen"],["Pensioenregeling",i.pensionReference],["Premie AWf (werkgever)",euro(r.awf)],["Premie Aof (werkgever)",euro(r.aof)],["Premie Whk (werkgever)",euro(r.whk)],["Opslag kinderopvang (werkgever)",euro(r.wko)],["Totale werkgeverskosten incl. reservering",euro(r.employerCost)]]),
    section("Vakantiegeld en cumulatieven",[["Opbouw vakantiegeld deze maand",euro(r.holidayAccrual)],["Vakantiegeldgrondslag / percentage",`${euro(i.holidayUseCustomBasis ? i.holidayBasis : i.baseSalary+i.extraGross)} / ${i.holidayRate}%`],["Reserve vakantiegeld einde periode",euro(r.holidayBalance)],["Brutoloon cumulatief",euro(cum("gross"))],["Fiscaal loon cumulatief",euro(cum("fiscalWage"))],["Loonheffing cumulatief",euro(cum("wageTax"))],["Arbeidskorting cumulatief",euro(cum("laborCredit"))],["Pensioen werknemer cumulatief",euro(cum("pensionEmployee"))],["Werkgeversheffing Zvw cumulatief",euro(cum("zvw"))],["Cumulatieven",i.openingPeriods ? "Loonbedragen vanaf start BoekBalans; VCR inclusief beginstanden" : "Opgeslagen loonstroken van dit kalenderjaar"]])];
}
export function journalSections(s: EmployeeSalary): FinanceSection[] {
  if (!s.employeePayroll) return [];
  return [{title:`Loonjournaal ${s.employeeName} ${s.period}`,headers:["Grootboekrekening","Debet","Credit"],widths:[301,105,105],rows:employeeJournal(s.employeePayroll).map(l=>[l.account,euro(l.debit),euro(l.credit)])}];
}

// Payment status never recalculates an already finalised wage period or its VCR.
export function markEmployeeSalaryPaid(s: EmployeeSalary, date: string): EmployeeSalary {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10)!==date) throw new Error("Vul een geldige werkelijke betaaldatum in.");
  return {...s,status:"paid",paymentDate:date,...(s.employeePayroll ? {employeePayroll:{...s.employeePayroll,input:{...s.employeePayroll.input,status:"paid",paymentDate:date}}}: {})};
}
