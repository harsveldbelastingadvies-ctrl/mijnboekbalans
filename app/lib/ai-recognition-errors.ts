/** Only known categories and the HTTP status reach the UI; never raw upstream messages. */
export function bankRecognitionFailure(status: number, value: unknown) {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const error = record.error && typeof record.error === "object" ? record.error as Record<string, unknown> : {};
  const codes = [error.code, error.type].filter((value): value is string => typeof value === "string");
  let action: string;
  if (codes.includes("credit_balance_exhausted")) action = "Het OpenAI-API-tegoed is op. Controleer het saldo bij OpenAI Billing en voeg zo nodig tegoed toe.";
  else if (codes.some((code) => ["organization_spend_limit_exceeded", "project_spend_limit_exceeded", "billing_hard_limit_reached"].includes(code))) action = "De OpenAI-bestedingslimiet is bereikt. Controleer de limieten van de organisatie en het project.";
  else if (codes.includes("organization_usage_limit_exceeded")) action = "De OpenAI-gebruikslimiet is bereikt. Controleer de organisatielimiet bij OpenAI.";
  else if (codes.includes("insufficient_quota")) action = "OpenAI meldt onvoldoende API-tegoed of een bereikte limiet. Controleer Billing en Limits voor de organisatie waarop BoekBalans is aangesloten.";
  else if (status === 401) action = "OpenAI accepteert de ingestelde API-sleutel niet. Controleer de OpenAI-sleutel in de instellingen van BoekBalans op Cloudflare.";
  else if (status === 403 || status === 404) action = "De OpenAI-sleutel heeft geen toegang tot het gekozen model of de functie. Controleer de modeltoegang en instellingen van BoekBalans.";
  else if (status === 429) action = "OpenAI ontvangt nu te veel aanvragen of de aanvraag overschrijdt een snelheidslimiet. Wacht even en probeer daarna één kleiner afschrift.";
  else if (status >= 500) action = "OpenAI heeft een tijdelijke storing. Probeer het afschrift later opnieuw te lezen.";
  else action = "OpenAI heeft het leesverzoek geweigerd. Dit bewijst geen tekort aan credits. Controleer het gekozen model en probeer een kleiner, onbeschermd PDF-afschrift.";
  return `PDF bewaard. ${action} (HTTP ${status})`;
}
