import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type InvoiceAnalysis = {
  invoiceNumber: string;
  date: string;
  description: string;
  relation: string;
  type: "income" | "expense";
  category: string;
  amountExVat: number;
  vatRate: 0 | 9 | 21;
  vatLines: Array<{
    category: string;
    amountExVat: number;
    vatRate: 0 | 9 | 21;
  }>;
  status: "paid" | "open";
  confidence: number;
  note: string;
};

const maxFileSize = 12 * 1024 * 1024;
const allowedTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
  "text/csv",
  "application/xml",
  "text/xml",
]);

function isAllowedFile(file: File) {
  if (allowedTypes.has(file.type)) return true;
  return /\.(pdf|jpe?g|png|webp|xml|ubl|csv|txt)$/i.test(file.name);
}

function getBase64(arrayBuffer: ArrayBuffer) {
  return Buffer.from(arrayBuffer).toString("base64");
}

function extractOutputText(data: unknown) {
  const record = data as Record<string, unknown>;
  if (typeof record.output_text === "string") return record.output_text;

  const output = Array.isArray(record.output) ? record.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = Array.isArray((item as Record<string, unknown>).content)
      ? ((item as Record<string, unknown>).content as unknown[])
      : [];
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const partRecord = part as Record<string, unknown>;
      if (typeof partRecord.text === "string") return partRecord.text;
    }
  }

  return "";
}

function normalizeAnalysis(value: unknown): InvoiceAnalysis {
  const data = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const type = data.type === "income" ? "income" : "expense";
  const rawVatRate = Number(data.vatRate);
  const vatRate = rawVatRate === 9 || rawVatRate === 0 ? rawVatRate : 21;
  const rawAmount = Number(data.amountExVat);
  const confidence = Math.min(98, Math.max(0, Number(data.confidence) || 55));
  const rawVatLines = Array.isArray(data.vatLines) ? data.vatLines : [];
  const vatLines = rawVatLines
    .map((line) => {
      const record = line && typeof line === "object" ? (line as Record<string, unknown>) : {};
      const lineVatRate = Number(record.vatRate);
      const lineAmount = Number(record.amountExVat);
      return {
        category:
          typeof record.category === "string" && record.category.trim()
            ? record.category.trim()
            : type === "income"
              ? "Omzet diensten"
              : "Inkoop",
        amountExVat: Number.isFinite(lineAmount) && lineAmount > 0 ? lineAmount : 0,
        vatRate: (lineVatRate === 9 || lineVatRate === 0 ? lineVatRate : 21) as 0 | 9 | 21,
      };
    })
    .filter((line) => line.amountExVat > 0);

  return {
    invoiceNumber: typeof data.invoiceNumber === "string" ? data.invoiceNumber : "",
    date:
      typeof data.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data.date)
        ? data.date
        : new Date().toISOString().slice(0, 10),
    description:
      typeof data.description === "string" && data.description.trim()
        ? data.description.trim()
        : "Factuur",
    relation: typeof data.relation === "string" ? data.relation.trim() : "",
    type,
    category:
      typeof data.category === "string" && data.category.trim()
        ? data.category.trim()
        : type === "income"
          ? "Omzet diensten"
          : "Inkoop",
    amountExVat: Number.isFinite(rawAmount) && rawAmount > 0 ? rawAmount : 0,
    vatRate,
    vatLines:
      vatLines.length > 0
        ? vatLines
        : [
            {
              category: type === "income" ? "Omzet diensten" : "Inkoop",
              amountExVat: Number.isFinite(rawAmount) && rawAmount > 0 ? rawAmount : 0,
              vatRate,
            },
          ],
    status: data.status === "open" ? "open" : "paid",
    confidence,
    note:
      typeof data.note === "string" && data.note.trim()
        ? data.note.trim()
        : "AI-voorstel gemaakt. Controleer de velden voordat je boekt.",
  };
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_INVOICE_MODEL || "gpt-4.1-mini";

  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "AI-herkenning is voorbereid, maar OPENAI_API_KEY staat nog niet in Cloudflare.",
      },
      { status: 503 },
    );
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const contacts = String(formData.get("contacts") ?? "[]").slice(0, 12000);

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Geen factuurbestand ontvangen." }, { status: 400 });
  }

  if (file.size > maxFileSize) {
    return NextResponse.json(
      { error: "Dit bestand is te groot voor AI-herkenning. Gebruik maximaal 12 MB." },
      { status: 413 },
    );
  }

  if (!isAllowedFile(file)) {
    return NextResponse.json(
      { error: "Gebruik een PDF, afbeelding, XML/UBL, CSV of tekstbestand." },
      { status: 400 },
    );
  }

  const mimeType = file.type || "application/octet-stream";
  const fileData = `data:${mimeType};base64,${getBase64(await file.arrayBuffer())}`;
  const prompt = [
    "Lees deze Nederlandse verkoopfactuur, inkoopfactuur, bon of UBL/XML-factuur.",
    "Geef uitsluitend gegevens terug die nodig zijn om een boeking in BoekBalans voor te stellen.",
    "Bedragen moeten exclusief btw zijn. Als alleen inclusief btw zichtbaar is, reken dan terug met het gekozen btw-tarief.",
    "Kies type 'income' voor verkoopfacturen en 'expense' voor inkoopfacturen of bonnetjes.",
    "Kies category bij income uit: Omzet diensten, Omzet producten, Abonnementen, Overige inkomsten.",
    "Kies category bij expense uit: Inkoop, Uitbesteed werk, Investeringen, Software, Kantoorkosten, Auto- en transportkosten, Huisvestingskosten, Reiskosten, Marketing, Administratiekosten, Bankkosten, Representatiekosten, Telefoonkosten, Verzekeringen, Overige kosten.",
    "Als een inkoopfactuur meerdere btw-percentages of grondslagen heeft, vul vatLines met een aparte regel per btw-percentage.",
    "De som van vatLines.amountExVat moet aansluiten op amountExVat. Gebruik bij verkoopfacturen normaal één vatLine.",
    "Gebruik status 'open' voor verkoopfacturen, tenzij betaling duidelijk zichtbaar is. Gebruik bij kosten standaard 'paid', tenzij openstaand duidelijk zichtbaar is.",
    `Bekende relaties uit deze administratie: ${contacts}`,
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            {
              type: "input_file",
              filename: file.name,
              file_data: fileData,
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "boekbalans_invoice_analysis",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              invoiceNumber: { type: "string" },
              date: { type: "string", description: "Datum als YYYY-MM-DD" },
              description: { type: "string" },
              relation: { type: "string" },
              type: { type: "string", enum: ["income", "expense"] },
              category: { type: "string" },
              amountExVat: { type: "number" },
              vatRate: { type: "number", enum: [0, 9, 21] },
              vatLines: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    category: { type: "string" },
                    amountExVat: { type: "number" },
                    vatRate: { type: "number", enum: [0, 9, 21] },
                  },
                  required: ["category", "amountExVat", "vatRate"],
                },
              },
              status: { type: "string", enum: ["paid", "open"] },
              confidence: { type: "number" },
              note: { type: "string" },
            },
            required: [
              "invoiceNumber",
              "date",
              "description",
              "relation",
              "type",
              "category",
              "amountExVat",
              "vatRate",
              "vatLines",
              "status",
              "confidence",
              "note",
            ],
          },
        },
      },
    }),
  });

  const data = (await response.json()) as unknown;

  if (!response.ok) {
    return NextResponse.json(
      { error: "OpenAI kon deze factuur nu niet herkennen.", details: data },
      { status: response.status },
    );
  }

  const outputText = extractOutputText(data);
  if (!outputText) {
    return NextResponse.json(
      { error: "OpenAI gaf geen bruikbaar factuurvoorstel terug." },
      { status: 502 },
    );
  }

  try {
    return NextResponse.json({ result: normalizeAnalysis(JSON.parse(outputText)) });
  } catch {
    return NextResponse.json(
      { error: "OpenAI gaf geen geldig JSON-factuurvoorstel terug." },
      { status: 502 },
    );
  }
}
