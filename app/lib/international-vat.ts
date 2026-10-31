// Deliberate classification by the preparer, not a place-of-supply rules engine.
export const salesVatOptions = [
  ["nl", "Nederlandse btw (ook buitenlandse klant)"],
  ["eu_goods", "EU-goederenlevering 0% · 3b + ICP"],
  ["eu_services", "EU-dienst btw verlegd · 3b + ICP"],
  ["export_goods", "Uitvoer goederen buiten EU · 3a"],
  ["non_eu_services", "Dienst belast buiten EU · buiten NL-aangifte"],
  ["oss", "EU-particulier: buitenlandse btw via OSS"],
  ["foreign_goods", "EU-afstands-/installatielevering: lokale aangifte · 3c"],
  ["foreign_services", "Dienst belast in buitenland: lokale aangifte"],
  ["exempt", "Vrijgestelde omzet · buiten NL-aangifte"],
] as const;
export type SalesVatTreatment = typeof salesVatOptions[number][0];
export type SalesVatDetails = {
  treatment: SalesVatTreatment;
  country: string;
  customerType: "business" | "private";
  customerVatId: string;
  vatIdChecked: boolean;
  conditionsConfirmed: boolean;
  serviceDate: string;
  evidence: string;
  foreignVatAmount: number;
};
export type SalesVatDraft = Omit<SalesVatDetails, "foreignVatAmount"> & { foreignVatAmount: string };
export const emptySalesVat: SalesVatDraft = { treatment: "nl", country: "NL", customerType: "business", customerVatId: "", vatIdChecked: false, conditionsConfirmed: false, serviceDate: "", evidence: "", foreignVatAmount: "" };
export const euCountries = "AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE".split(" ");
const validCountries = new Set("AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW XI".split(" "));
export const isForeignVat = (treatment?: string) => ["oss", "foreign_goods", "foreign_services"].includes(treatment ?? "");
export const usesDutchSalesVat = (entry: { type: string; salesVat?: SalesVatDetails }) => entry.type !== "income" || !entry.salesVat || entry.salesVat.treatment === "nl";
export const normalizeVatId = (value: string) => value.toUpperCase().replace(/[\s.\-]/g, "");
export function parseForeignVat(value: string) {
  if (!value.trim()) return NaN;
  const number = Number(value.trim().replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(number) ? number : NaN;
}
export function salesVatDetails(draft?: SalesVatDraft): SalesVatDetails | undefined {
  if (!draft) return undefined;
  return { ...draft, country: draft.country.trim().toUpperCase(), customerVatId: normalizeVatId(draft.customerVatId), foreignVatAmount: isForeignVat(draft.treatment) ? parseForeignVat(draft.foreignVatAmount) : 0 };
}
export function toSalesVatDraft(details?: SalesVatDetails): SalesVatDraft {
  return details ? { ...details, foreignVatAmount: String(details.foreignVatAmount).replace(".", ",") } : { ...emptySalesVat };
}
const dateValid = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
export function salesVatError(details: SalesVatDetails | undefined, amount: number, vatRate: number) {
  if (!details) return ""; // Existing entries retain their old treatment.
  const { treatment, country, customerType, customerVatId, vatIdChecked, conditionsConfirmed, serviceDate, foreignVatAmount } = details;
  if (!salesVatOptions.some(([key]) => key === treatment)) return "Kies een geldige btw-behandeling.";
  if (!validCountries.has(country)) return "Vul een geldige ISO-landcode in (bijvoorbeeld DE, GB of US).";
  if (country === "XI" && treatment !== "eu_goods") return "Gebruik XI alleen voor EU-goederenleveringen in Noord-Ierland; voor diensten gebruik je GB.";
  if (treatment === "nl") {
    if (![0, 9, 21].includes(vatRate)) return "Kies het Nederlandse btw-tarief.";
    if (country !== "NL" && !conditionsConfirmed) return "Bevestig dat voor deze buitenlandse klant Nederlandse btw van toepassing is.";
    return "";
  }
  if (vatRate !== 0) return "Gebruik 0% Nederlandse btw bij deze btw-behandeling. Buitenlandse btw leg je afzonderlijk vast.";
  if (!conditionsConfirmed) return "Bevestig de fiscale behandeling en toepasselijke voorwaarden voor deze factuur.";
  if (treatment === "exempt") return "";
  if (country === "NL") return "Kies het buitenlandse land van de afnemer / belastingheffing.";
  const eu = euCountries.includes(country);
  if (["eu_goods", "eu_services", "oss", "foreign_goods"].includes(treatment) && !(eu || treatment === "eu_goods" && country === "XI")) return "Deze keuze vereist een EU-btw-land. XI geldt uitsluitend voor goederen in Noord-Ierland.";
  if (["export_goods", "non_eu_services"].includes(treatment) && (eu || country === "XI")) return "Deze keuze vereist een land buiten het EU-btw-gebied.";
  if (["eu_goods", "eu_services"].includes(treatment)) {
    if (customerType !== "business") return "Deze ICP-route is bedoeld voor afnemers met een geldig buitenlands btw-id.";
    // Syntax only. VIES validity must be checked and documented by the preparer.
    const prefix = country === "GR" ? "EL" : country;
    if (!customerVatId.startsWith(prefix) || !/^[A-Z]{2}[A-Z0-9]{2,12}$/.test(customerVatId)) return "Vul het buitenlandse btw-id in met de juiste landcode (Griekenland: EL).";
    if (!vatIdChecked) return "Controleer het btw-id in VIES en bevestig de controle.";
    if (treatment === "eu_services" && !dateValid(serviceDate)) return "Vul de datum in waarop de intracommunautaire dienst is geleverd.";
  }
  if (treatment === "oss" && customerType !== "private") return "Deze OSS-route ondersteunt leveringen/diensten aan particulieren en afnemers die geen btw-aangifte doen.";
  if (isForeignVat(treatment)) {
    if (!Number.isFinite(foreignVatAmount) || Math.abs(foreignVatAmount) > Math.abs(amount) || amount * foreignVatAmount < 0) return "Vul een passend buitenlands btw-bedrag in euro in, met hetzelfde teken als de factuur.";
  }
  return "";
}
export type SalesEntry = { inputVatAmount?: number; type: "income" | "expense"; amount: number; vatRate: number; date: string; relation?: string; invoiceNumber?: string; salesVat?: SalesVatDetails; balanceOnly?: boolean; salaryRecordId?: string; payrollDeclarationId?: string };
export function invoicedVat(entry: SalesEntry) {
  if (entry.balanceOnly) return 0;
  if (entry.type === "expense" && entry.inputVatAmount !== undefined) return entry.inputVatAmount;
  if (entry.type === "income" && entry.salesVat && entry.salesVat.treatment !== "nl") return isForeignVat(entry.salesVat.treatment) ? entry.salesVat.foreignVatAmount : 0;
  return entry.amount * entry.vatRate / 100;
}
export function dutchVat(entry: SalesEntry) {
  return usesDutchSalesVat(entry) ? invoicedVat(entry) : 0;
}
export function buildInternationalVat(entries: SalesEntry[]) {
  const selected = entries.filter((entry) => entry.type === "income" && !entry.balanceOnly && !entry.salaryRecordId && !entry.payrollDeclarationId);
  const rubrics = ["1a", "1b", "1e", "3a", "3b", "3c"].map((code) => ({ code, basis: 0, vat: 0 }));
  const icp = new Map<string, { country: string; vatId: string; goods: number; services: number }>();
  const foreign = new Map<string, { country: string; route: string; basis: number; vat: number }>();
  const excluded: SalesEntry[] = [];
  for (const entry of selected) {
    const details = entry.salesVat;
    const treatment = details?.treatment ?? "nl";
    const code = treatment === "nl" ? entry.vatRate === 21 ? "1a" : entry.vatRate === 9 ? "1b" : "1e" : treatment === "export_goods" ? "3a" : ["eu_goods", "eu_services"].includes(treatment) ? "3b" : treatment === "foreign_goods" ? "3c" : "";
    const rubric = rubrics.find((row) => row.code === code);
    if (rubric) { rubric.basis += entry.amount; rubric.vat += dutchVat(entry); }
    else excluded.push(entry);
    if (code === "3b" && details) {
      const key = `${details.country}:${normalizeVatId(details.customerVatId)}`;
      const row = icp.get(key) ?? { country: details.country, vatId: normalizeVatId(details.customerVatId), goods: 0, services: 0 };
      if (treatment === "eu_goods") row.goods += entry.amount; else row.services += entry.amount;
      icp.set(key, row);
    }
    if (isForeignVat(treatment) && details) {
      const key = `${details.country}:${treatment}`;
      const row = foreign.get(key) ?? { country: details.country, route: treatment, basis: 0, vat: 0 };
      row.basis += entry.amount; row.vat += details.foreignVatAmount; foreign.set(key, row);
    }
  }
  const icpRows = [...icp.values()].sort((a, b) => `${a.country}${a.vatId}`.localeCompare(`${b.country}${b.vatId}`));
  const icpTotal = icpRows.reduce((sum, row) => sum + row.goods + row.services, 0);
  return { rubrics, icpRows, icpTotal, icpDifference: Math.round((icpTotal - (rubrics.find((row) => row.code === "3b")?.basis ?? 0)) * 100) / 100,
    foreignRows: [...foreign.values()], excluded, foreignVatTotal: [...foreign.values()].reduce((sum, row) => sum + row.vat, 0) };
}

export function allocateForeignVat(amount: number, bases: number[]) {
  const total = bases.reduce((sum, value) => sum + value, 0);
  let allocated = 0;
  return bases.map((basis, index) => {
    const value = Math.round((index === bases.length - 1 ? amount - allocated : total ? amount * basis / total : 0) * 100) / 100;
    allocated += value;
    return value;
  });
}
export function isTaxableSalesTurnover(entry: SalesEntry) {
  return entry.type === "income" && !entry.balanceOnly && !entry.salaryRecordId && !entry.payrollDeclarationId && (entry.salesVat ? entry.salesVat.treatment !== "exempt" : entry.vatRate > 0);
}
