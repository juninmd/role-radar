import type { CatalogEvent } from "./catalog.ts";

const CRLF = "\r\n";
const enc = new TextEncoder();
const TIMED_DURATION_MS = 3 * 60 * 60 * 1000; // mesma suposição do link "Pôr na agenda"

/** RFC 5545 §3.3.11: estes caracteres quebram o campo de texto se não forem escapados. */
const escapeText = (s: string) =>
  s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");

/** Linha com no máximo 75 octetos UTF-8; a continuação começa com espaço (RFC 5545 §3.1). */
function fold(line: string): string {
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > 75) {
      out.push(cur);
      cur = " ";
      bytes = 1;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join(CRLF);
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]|\.\d{3}/g, "");
const ymd = (d: Date) => d.toISOString().slice(0, 10).replaceAll("-", "");
/** Hora sem fuso (floating): o calendário mostra no fuso do aparelho, que na região é o mesmo. */
const local = (d: Date) =>
  `${ymd(d)}T${d.toISOString().slice(11, 19).replaceAll(":", "")}`;

function eventLines(e: CatalogEvent, dtstamp: string): string[] {
  const lines = [
    "BEGIN:VEVENT",
    `UID:${e.id}@role-radar`,
    `DTSTAMP:${dtstamp}`,
  ];
  // 25:00 passa no formato mas não existe: sem isto, toISOString lança e a agenda cai.
  const timed = Boolean(e.time && /^([01]\d|2[0-3]):[0-5]\d$/.test(e.time));
  const start = new Date(`${e.date}T${timed ? e.time : "00:00"}:00Z`);
  if (timed) {
    lines.push(`DTSTART:${local(start)}`);
    lines.push(`DTEND:${local(new Date(start.getTime() + TIMED_DURATION_MS))}`);
  } else {
    // DTEND de dia inteiro é exclusivo: o último dia precisa de +1.
    const last = new Date(`${e.endDate ?? e.date}T00:00:00Z`);
    last.setUTCDate(last.getUTCDate() + 1);
    lines.push(`DTSTART;VALUE=DATE:${ymd(start)}`);
    lines.push(`DTEND;VALUE=DATE:${ymd(last)}`);
  }
  lines.push(`SUMMARY:${escapeText(e.title)}`);
  const where = [e.venue, e.city].filter(Boolean).join(", ");
  if (where) lines.push(`LOCATION:${escapeText(where)}`);
  if (e.link) lines.push(`URL:${e.link}`);
  lines.push("END:VEVENT");
  return lines;
}

/** Agenda em iCalendar (.ics) para assinar ou importar em qualquer app de calendário. */
export function buildIcs(events: CatalogEvent[], now = new Date()): string {
  const dtstamp = stamp(now);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Role Radar//Agenda//PT-BR",
    "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:Rolê Radar",
    ...events.flatMap((e) => eventLines(e, dtstamp)),
    "END:VCALENDAR",
  ];
  return `${lines.map(fold).join(CRLF)}${CRLF}`;
}
