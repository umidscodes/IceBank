/** Client-side checks for cheque images. The server also sniffs the file content, so these are only a convenience. */
export const MAX_CHEQUE_IMAGE_BYTES = 5 * 1024 * 1024;
export const CHEQUE_ACCEPT = "image/png,image/jpeg";

export function checkChequeImage(file: File | null): string | null {
  if (!file) return "Attach a JPG or PNG image.";
  const okType = file.type === "image/png" || file.type === "image/jpeg" || /\.(png|jpe?g)$/i.test(file.name);
  if (!okType) return "The image must be a JPG or PNG file.";
  if (file.size === 0) return "The file is empty.";
  if (file.size > MAX_CHEQUE_IMAGE_BYTES) return "The image must be 5 MB or smaller.";
  return null;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
