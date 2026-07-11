import { NextRequest, NextResponse } from "next/server";

type KvkResult = {
  name: string;
  kvk: string;
  address: string;
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pickString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function formatAddress(item: Record<string, unknown>) {
  const address =
    (item.adres as Record<string, unknown> | undefined) ??
    (item.bezoekadres as Record<string, unknown> | undefined) ??
    (item.hoofdvestigingAdres as Record<string, unknown> | undefined);

  if (!address) return "";

  const street = pickString(address.straatnaam);
  const houseNumber = pickString(address.huisnummer);
  const addition = pickString(address.huisletter) || pickString(address.toevoegingAdres);
  const postalCode = pickString(address.postcode);
  const city = pickString(address.plaats);

  return [street, [houseNumber, addition].filter(Boolean).join(" "), postalCode, city]
    .filter(Boolean)
    .join(" ");
}

function normalizeKvkItem(item: unknown): KvkResult | null {
  if (!item || typeof item !== "object") return null;
  const record = item as Record<string, unknown>;
  const name =
    pickString(record.naam) ||
    pickString(record.handelsnaam) ||
    pickString(record.statutaireNaam);
  const kvk =
    pickString(record.kvkNummer) ||
    pickString(record.kvknummer) ||
    pickString(record.dossiernummer);

  if (!name && !kvk) return null;

  return {
    name,
    kvk,
    address: formatAddress(record),
  };
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const apiKey = process.env.KVK_API_KEY;

  if (query.length < 2) {
    return NextResponse.json({ results: [] });
  }

  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "KvK zoeken is voorbereid, maar de KVK_API_KEY staat nog niet in Cloudflare.",
      },
      { status: 503 },
    );
  }

  const searchParams = new URLSearchParams();
  if (/^\d{8}$/.test(query)) {
    searchParams.set("kvkNummer", query);
  } else {
    searchParams.set("naam", query);
  }

  const response = await fetch(`https://api.kvk.nl/api/v2/zoeken?${searchParams}`, {
    headers: { apikey: apiKey },
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: "KvK kon nu geen resultaten ophalen." },
      { status: response.status },
    );
  }

  const data = (await response.json()) as Record<string, unknown>;
  const rawItems =
    (Array.isArray(data.resultaten) && data.resultaten) ||
    (Array.isArray(data.results) && data.results) ||
    [];

  const results = rawItems
    .map(normalizeKvkItem)
    .filter((item): item is KvkResult => Boolean(item))
    .slice(0, 8);

  return NextResponse.json({ results });
}
