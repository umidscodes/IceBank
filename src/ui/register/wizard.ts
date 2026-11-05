/** Registration wizard: form state, per-step validation (mirrors the server rules) and field-to-step mapping. */
import { EMAIL_RE, PHONE_RE, POSTAL_CODE_RE, PROVINCES, normaliseSin, passwordProblems } from "@/lib/validation";

export interface RegisterForm {
  firstName: string; lastName: string; dateOfBirth: string; phone: string; email: string; sin: string;
  addressLine1: string; addressLine2: string; city: string; province: string; postalCode: string;
  password: string; confirmPassword: string; terms: boolean;
}

export const EMPTY_FORM: RegisterForm = {
  firstName: "", lastName: "", dateOfBirth: "", phone: "", email: "", sin: "",
  addressLine1: "", addressLine2: "", city: "", province: "", postalCode: "",
  password: "", confirmPassword: "", terms: false,
};

export type Step = 1 | 2 | 3 | 4;
export const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: "Personal info" }, { n: 2, label: "Address" }, { n: 3, label: "Security" }, { n: 4, label: "Review" },
];

/** Which step owns each API field (used to jump back when the server rejects a field). */
export const FIELD_STEP: Record<string, Step> = {
  firstName: 1, lastName: 1, dateOfBirth: 1, phone: 1, email: 1, sin: 1,
  addressLine1: 2, addressLine2: 2, city: 2, province: 2, postalCode: 2,
  password: 3, confirmPassword: 3, terms: 3,
};

export const PROVINCE_OPTIONS = Object.entries(PROVINCES).map(([value, name]) => ({ value, label: `${name} (${value})` }));

/** Today's date in Toronto as YYYY-MM-DD. */
export function todayToronto(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function ageOn(dob: string, on: string): number {
  const [y, m, d] = dob.split("-").map(Number);
  const [ry, rm, rd] = on.split("-").map(Number);
  let age = ry - y;
  if (rm < m || (rm === m && rd < d)) age--;
  return age;
}

function realDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** "4165550199" or "416-555-0199" -> "(416) 555-0199" (formats as the user types). */
export function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 10);
  if (d.length === 0) return "";
  if (d.length <= 3) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

export function normalisePostal(raw: string): string {
  const v = raw.toUpperCase();
  return /^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(v) ? `${v.slice(0, 3)} ${v.slice(3)}` : v;
}

export function validateStep(step: Step, f: RegisterForm): Record<string, string> {
  const e: Record<string, string> = {};
  if (step === 1) {
    if (!f.firstName.trim()) e.firstName = "Enter your first name.";
    else if (f.firstName.trim().length > 50) e.firstName = "First name must be at most 50 characters.";
    if (!f.lastName.trim()) e.lastName = "Enter your last name.";
    else if (f.lastName.trim().length > 50) e.lastName = "Last name must be at most 50 characters.";
    const today = todayToronto();
    if (!f.dateOfBirth) e.dateOfBirth = "Enter your date of birth.";
    else if (!realDate(f.dateOfBirth)) e.dateOfBirth = "Enter a real date.";
    else if (f.dateOfBirth > today) e.dateOfBirth = "Date of birth must be in the past.";
    else if (ageOn(f.dateOfBirth, today) < 18) e.dateOfBirth = "You must be at least 18 years old to open an account.";
    if (!f.phone) e.phone = "Enter your phone number.";
    else if (!PHONE_RE.test(f.phone)) e.phone = "Use the format (###) ###-####.";
    if (!f.email.trim()) e.email = "Enter your email address.";
    else if (!EMAIL_RE.test(f.email.trim())) e.email = "Enter a valid email address, e.g. name@example.com.";
    if (!f.sin.trim()) e.sin = "Enter your Social Insurance Number.";
    else if (normaliseSin(f.sin.trim()) === null) e.sin = "Enter a valid 9-digit SIN.";
  }
  if (step === 2) {
    if (!f.addressLine1.trim()) e.addressLine1 = "Enter your street address.";
    else if (f.addressLine1.trim().length > 100) e.addressLine1 = "Address must be at most 100 characters.";
    if (f.addressLine2.trim().length > 100) e.addressLine2 = "Address line 2 must be at most 100 characters.";
    if (!f.city.trim()) e.city = "Enter your city.";
    else if (f.city.trim().length > 60) e.city = "City must be at most 60 characters.";
    if (!f.province) e.province = "Choose your province or territory.";
    else if (!PROVINCES[f.province]) e.province = "Choose a valid province or territory.";
    const pc = f.postalCode.trim().toUpperCase();
    if (!pc) e.postalCode = "Enter your postal code.";
    else if (!POSTAL_CODE_RE.test(pc)) e.postalCode = "Enter a Canadian postal code in the format A1A 1A1.";
  }
  if (step === 3) {
    if (!f.password) e.password = "Create a password.";
    else {
      const p = passwordProblems(f.password);
      if (p.length) e.password = `Password ${p.join(", ")}.`;
    }
    if (!f.confirmPassword) e.confirmPassword = "Confirm your password.";
    else if (f.confirmPassword !== f.password) e.confirmPassword = "Passwords do not match.";
    if (!f.terms) e.terms = "You must accept the terms and conditions.";
  }
  return e;
}

export function toRegisterBody(f: RegisterForm) {
  return {
    firstName: f.firstName.trim(), lastName: f.lastName.trim(), dateOfBirth: f.dateOfBirth, email: f.email.trim(), phone: f.phone,
    addressLine1: f.addressLine1.trim(), addressLine2: f.addressLine2.trim() || null, city: f.city.trim(), province: f.province,
    postalCode: f.postalCode.trim().toUpperCase(), sin: f.sin.trim(), password: f.password,
  };
}

/** "046454286" -> "*** *** 286" for the review step. */
export function maskSin(sin: string): string {
  const d = sin.replace(/\D/g, "");
  return d.length >= 3 ? `*** *** ${d.slice(-3)}` : "";
}
