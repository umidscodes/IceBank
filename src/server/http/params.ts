import { fieldError, notFound } from "../errors";

/** Path ids must be positive whole numbers; anything else is a 400, an unknown id a 404. */
export function intParam(value: string | undefined, name = "id"): number {
  if (!value || !/^\d{1,15}$/.test(value)) throw fieldError(name, "must be a positive whole number");
  const n = Number(value);
  if (n <= 0) throw notFound();
  return n;
}

export interface SortSpec { sql: string }

/**
 * Parses "field,dir" against an allow-list of field -> SQL column. Unknown fields are a 400.
 */
export function parseSort(sort: string | undefined, allowed: Record<string, string>, fallback: string): string {
  if (!sort) return fallback;
  const [field, dirRaw] = sort.split(",");
  const col = allowed[field];
  if (!col) throw fieldError("sort", `must be one of ${Object.keys(allowed).join(", ")} followed by ,asc or ,desc`);
  const dir = (dirRaw ?? "asc").toLowerCase();
  if (dir !== "asc" && dir !== "desc") throw fieldError("sort", "direction must be asc or desc");
  return `${col} ${dir.toUpperCase()}`;
}

export function pageResult<T>(content: T[], page: number, size: number, total: number) {
  return { content, page, size, totalElements: total, totalPages: total === 0 ? 0 : Math.ceil(total / size) };
}
