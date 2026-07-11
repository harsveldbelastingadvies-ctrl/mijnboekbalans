import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PdokDoc = {
  straatnaam?: string;
  huisnummer?: string;
  huisletter?: string;
  huisnummertoevoeging?: string;
  postcode?: string;
  woonplaatsnaam?: string;
  weergavenaam?: string;
};

function normalizePostalCode(value: string) {
  return value.replace(/\s+/g, "").toUpperCase();
}

function formatAddress(doc: PdokDoc) {
  const number = [doc.huisnummer, doc.huisletter, doc.huisnummertoevoeging]
    .filter(Boolean)
    .join("");
  const address = [
    [doc.straatnaam, number].filter(Boolean).join(" "),
    [doc.postcode, doc.woonplaatsnaam].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");

  return address || doc.weergavenaam || "";
}

export async function GET(request: NextRequest) {
  const postalCode = normalizePostalCode(
    request.nextUrl.searchParams.get("postalCode") ?? "",
  );
  const houseNumber = request.nextUrl.searchParams.get("houseNumber")?.trim() ?? "";
  const addition = request.nextUrl.searchParams.get("addition")?.trim() ?? "";

  if (!/^[1-9][0-9]{3}[A-Z]{2}$/.test(postalCode) || !houseNumber) {
    return NextResponse.json(
      { error: "Vul een geldige postcode en huisnummer in." },
      { status: 400 },
    );
  }

  const query = [postalCode, houseNumber, addition].filter(Boolean).join(" ");
  const url = new URL("https://api.pdok.nl/bzk/locatieserver/search/v3_1/free");
  url.searchParams.set("q", query);
  url.searchParams.set("fq", "type:adres");
  url.searchParams.set("rows", "1");

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: "Adres kon nu niet worden opgehaald." },
      { status: response.status },
    );
  }

  const data = (await response.json()) as {
    response?: { docs?: PdokDoc[] };
  };
  const doc = data.response?.docs?.[0];
  const address = doc ? formatAddress(doc) : "";

  if (!address) {
    return NextResponse.json(
      { error: "Geen adres gevonden voor deze postcode en huisnummer." },
      { status: 404 },
    );
  }

  return NextResponse.json({ address });
}
