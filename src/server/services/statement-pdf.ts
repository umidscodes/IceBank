/** Monthly statement PDF (pdf-lib, standard fonts only so it works offline on every OS). */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatDisplay } from "@/lib/money";
import { DateTime } from "luxon";
import { ZONE } from "@/lib/dates";

const NAVY = rgb(11 / 255, 37 / 255, 69 / 255);
const GLACIER = rgb(79 / 255, 163 / 255, 217 / 255);
const MUTED = rgb(0.36, 0.42, 0.49);

interface Input {
  account: { accountNumber: string; type: string; displayName: string };
  customer: Record<string, unknown> | undefined;
  statement: { month: string; periodStart: string; periodEnd: string; openingBalance: string; closingBalance: string; transactionCount: number };
  rows: { createdAt: string; description: string; direction: string; amount: string; balanceAfter: string | null; type: string }[];
}

/** WinAnsi-safe text (standard fonts cannot draw every Unicode character). */
const safe = (s: string) => s.normalize("NFKD").replace(/[^\x20-\x7E]/g, "");

export async function renderStatementPdf(input: Input): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Ice Bank statement ${input.statement.month}`);
  doc.setAuthor("Ice Bank");
  doc.setCreator("Ice Bank");
  doc.setProducer("Ice Bank");
  doc.setCreationDate(DateTime.fromISO(input.statement.periodEnd, { zone: ZONE }).plus({ days: 1 }).toJSDate());
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 612, H = 792, M = 48;

  let page = doc.addPage([W, H]);
  let y = H - M;
  const text = (p: PDFPage, t: string, x: number, yy: number, size = 10, f: PDFFont = font, color = rgb(0.1, 0.16, 0.23)) =>
    p.drawText(safe(t), { x, y: yy, size, font: f, color });
  const right = (p: PDFPage, t: string, xRight: number, yy: number, size = 10, f: PDFFont = font) =>
    text(p, t, xRight - f.widthOfTextAtSize(safe(t), size), yy, size, f);

  // Header band
  page.drawRectangle({ x: 0, y: H - 86, width: W, height: 86, color: NAVY });
  page.drawCircle({ x: M + 14, y: H - 43, size: 14, color: GLACIER });
  text(page, "Ice Bank", M + 36, H - 50, 20, bold, rgb(1, 1, 1));
  page.drawText(safe("Account statement"), { x: W - M - bold.widthOfTextAtSize("Account statement", 12), y: H - 40, size: 12, font: bold, color: rgb(1, 1, 1) });
  page.drawText(safe(`${input.statement.periodStart} to ${input.statement.periodEnd}`), {
    x: W - M - font.widthOfTextAtSize(`${input.statement.periodStart} to ${input.statement.periodEnd}`, 10), y: H - 58, size: 10, font, color: rgb(0.85, 0.92, 0.97) });
  y = H - 120;

  const c = input.customer ?? {};
  text(page, `${c.first_name ?? ""} ${c.last_name ?? ""}`, M, y, 11, bold); y -= 14;
  text(page, String(c.address_line1 ?? ""), M, y); y -= 13;
  if (c.address_line2) { text(page, String(c.address_line2), M, y); y -= 13; }
  text(page, `${c.city ?? ""} ${c.province ?? ""}  ${c.postal_code ?? ""}`, M, y); y -= 26;

  text(page, input.account.displayName, M, y, 12, bold);
  right(page, `Account ${input.account.accountNumber}`, W - M, y, 10); y -= 22;

  // Summary box
  page.drawRectangle({ x: M, y: y - 44, width: W - 2 * M, height: 50, borderColor: rgb(0.86, 0.9, 0.94), borderWidth: 1, color: rgb(0.96, 0.98, 0.99) });
  text(page, "Opening balance", M + 12, y - 12, 9, font, MUTED);
  text(page, formatDisplay(input.statement.openingBalance), M + 12, y - 30, 13, bold);
  text(page, "Closing balance", M + 200, y - 12, 9, font, MUTED);
  text(page, formatDisplay(input.statement.closingBalance), M + 200, y - 30, 13, bold);
  text(page, "Transactions", M + 390, y - 12, 9, font, MUTED);
  text(page, String(input.statement.transactionCount), M + 390, y - 30, 13, bold);
  y -= 70;

  const header = (p: PDFPage, yy: number) => {
    text(p, "Date", M, yy, 9, bold, MUTED);
    text(p, "Description", M + 70, yy, 9, bold, MUTED);
    right(p, "Withdrawals", M + 370, yy, 9, bold);
    right(p, "Deposits", M + 445, yy, 9, bold);
    right(p, "Balance", W - M, yy, 9, bold);
    p.drawLine({ start: { x: M, y: yy - 5 }, end: { x: W - M, y: yy - 5 }, thickness: 0.7, color: rgb(0.86, 0.9, 0.94) });
  };
  header(page, y);
  y -= 20;
  if (input.rows.length === 0) { text(page, "No transactions this month.", M, y, 10, font, MUTED); y -= 16; }
  for (const r of input.rows) {
    if (y < M + 30) {
      page = doc.addPage([W, H]);
      y = H - M;
      text(page, `Ice Bank statement ${input.statement.month} - ${input.account.accountNumber} (continued)`, M, y, 9, font, MUTED);
      y -= 24;
      header(page, y);
      y -= 20;
    }
    const day = DateTime.fromISO(r.createdAt).setZone(ZONE).toFormat("LLL dd");
    text(page, day, M, y, 9);
    let desc = safe(r.description);
    while (font.widthOfTextAtSize(desc, 9) > 220 && desc.length > 3) desc = desc.slice(0, -2);
    text(page, desc, M + 70, y, 9);
    if (r.direction === "DEBIT") right(page, formatDisplay(r.amount), M + 370, y, 9);
    else right(page, formatDisplay(r.amount), M + 445, y, 9);
    right(page, r.balanceAfter ? formatDisplay(r.balanceAfter) : "", W - M, y, 9);
    y -= 15;
  }

  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawText(safe(`Ice Bank is a fictional bank for software testing. Not a real financial institution.   Page ${i + 1} of ${pages.length}`),
      { x: M, y: 24, size: 7.5, font, color: MUTED });
  });
  return doc.save({ useObjectStreams: false });
}
