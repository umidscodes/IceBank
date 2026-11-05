/** Static seed data. Everything here is fictional. */

export const SEED_PASSWORD = "IceBank#2026";
/** bcrypt hash of SEED_PASSWORD (fixed so seeded rows are byte-identical after every reset). */
export const SEED_PASSWORD_HASH = "$2b$10$zICHbY7DqBWI0qy19nbm9egnjHe0kkMZ42Jroa6C/fTSMhE6nCuvi";

/** Local sandbox key. Send it as the X-Sandbox-Key header to /test/* endpoints and GET /inbox. */
export const LOCAL_SANDBOX_KEY = "ICEBANK-LOCAL-KEY";

export const BRANCHES = [
  { transit: "10021", name: "Iceport Main" },
  { transit: "10045", name: "Harbourfront" },
  { transit: "20012", name: "Glacier Heights" },
  { transit: "30077", name: "Frost Valley" },
];

export const BILLERS = [
  { id: 1, name: "Niagara Power Co", category: "Utilities", pattern: "^\\d{10}$", hint: "10 digits, e.g. 4410028731" },
  { id: 2, name: "IceTel Mobile", category: "Telecom", pattern: "^IT\\d{8}$", hint: "IT followed by 8 digits, e.g. IT20456789" },
  { id: 3, name: "Maple Gas", category: "Utilities", pattern: "^\\d{4}-\\d{4}-\\d{4}$", hint: "####-####-####" },
  { id: 4, name: "City of Iceport Water", category: "Government", pattern: "^W\\d{7}$", hint: "W followed by 7 digits" },
  { id: 5, name: "City of Iceport Property Tax", category: "Government", pattern: "^\\d{3}-\\d{3}-\\d{5}$", hint: "###-###-#####" },
  { id: 6, name: "Glacier Home Insurance", category: "Insurance", pattern: "^GI-\\d{6}$", hint: "GI- followed by 6 digits" },
  { id: 7, name: "Northern Lights Internet", category: "Telecom", pattern: "^\\d{12}$", hint: "12 digits" },
  { id: 8, name: "Aurora Student Loans", category: "Loans", pattern: "^\\d{9}$", hint: "9 digits" },
  { id: 9, name: "Polar Auto Insurance", category: "Insurance", pattern: "^PA\\d{7}$", hint: "PA followed by 7 digits" },
  { id: 10, name: "Iceport Transit Pass", category: "Transportation", pattern: "^\\d{8}$", hint: "8 digits" },
  { id: 11, name: "Snowline Streaming", category: "Entertainment", pattern: "^SS\\d{6}$", hint: "SS followed by 6 digits" },
  { id: 12, name: "Frostline Hydro North", category: "Utilities", pattern: "^\\d{10}$", hint: "10 digits" },
];

export const MERCHANTS = [
  { name: "Frostbite Coffee", min: 3, max: 9 },
  { name: "Iceport Grocers", min: 25, max: 180 },
  { name: "Polar Pharmacy", min: 8, max: 60 },
  { name: "Northwind Gas Bar", min: 30, max: 90 },
  { name: "Snowcap Books", min: 12, max: 55 },
  { name: "Aurora Cinemas", min: 14, max: 40 },
  { name: "Glacier Hardware", min: 10, max: 140 },
  { name: "Tundra Eats", min: 15, max: 65 },
  { name: "Blizzard Burgers", min: 9, max: 28 },
  { name: "Floe Fitness", min: 45, max: 45 },
  { name: "Caribou Clothing", min: 30, max: 160 },
  { name: "Harbour Fish Market", min: 18, max: 75 },
  { name: "Icicle Pet Supply", min: 15, max: 90 },
  { name: "Summit Sports", min: 25, max: 220 },
];

export const EMPLOYERS = [
  "Iceport Logistics", "Glacier Health Network", "Northern Software Ltd", "City of Iceport",
  "Frost Valley School Board", "Harbourfront Hospitality", "Aurora Engineering", "Maple Ridge Retail",
];

/** Valid postal codes by province. */
export const ADDRESSES = [
  { city: "Toronto", province: "ON", postal: "M5V 2T6", street: "Front Street West" },
  { city: "Ottawa", province: "ON", postal: "K1P 5J2", street: "Bank Street" },
  { city: "Mississauga", province: "ON", postal: "L5B 3C2", street: "Burnhamthorpe Road" },
  { city: "Montreal", province: "QC", postal: "H3B 4W8", street: "Rue Sainte-Catherine" },
  { city: "Quebec City", province: "QC", postal: "G1R 4P5", street: "Grande Allee" },
  { city: "Vancouver", province: "BC", postal: "V6B 1A1", street: "Granville Street" },
  { city: "Victoria", province: "BC", postal: "V8W 1N4", street: "Douglas Street" },
  { city: "Calgary", province: "AB", postal: "T2P 3E5", street: "Stephen Avenue" },
  { city: "Edmonton", province: "AB", postal: "T5J 2R7", street: "Jasper Avenue" },
  { city: "Winnipeg", province: "MB", postal: "R3C 4T3", street: "Portage Avenue" },
  { city: "Regina", province: "SK", postal: "S4P 3Y2", street: "Albert Street" },
  { city: "Halifax", province: "NS", postal: "B3H 4R2", street: "Spring Garden Road" },
  { city: "Moncton", province: "NB", postal: "E1C 4M3", street: "Main Street" },
  { city: "St. John's", province: "NL", postal: "A1C 5M2", street: "Water Street" },
  { city: "Charlottetown", province: "PE", postal: "C1A 7K4", street: "Queen Street" },
  { city: "Whitehorse", province: "YT", postal: "Y1A 2C6", street: "Main Street" },
  { city: "Yellowknife", province: "NT", postal: "X1A 2P4", street: "Franklin Avenue" },
  { city: "Iqaluit", province: "NU", postal: "X0A 0H0", street: "Federal Road" },
];

export const FIRST_NAMES = [
  "Sophie", "Jacob", "Chloe", "William", "Zoe", "Benjamin", "Mia", "Ethan", "Charlotte", "Logan",
  "Amelia", "Nathan", "Lily", "Samuel", "Grace", "Thomas", "Emily", "Felix", "Hannah", "Owen",
  "Aria", "Gabriel", "Isla", "Henry", "Maya", "Leo", "Nora", "Jack", "Elena", "Raj",
  "Priya", "Kenji", "Aiyana", "Mohammed", "Fatima", "Mateo", "Lucia", "Daniel", "Ingrid", "Tariq",
  "Mei", "Oliver", "Anika", "Pierre",
];
export const LAST_NAMES = [
  "Bouchard", "Wilson", "Lavoie", "Campbell", "Nguyen", "Fortin", "Patel", "Morin", "Anderson", "Leblanc",
  "Thompson", "Gauthier", "Wong", "Pelletier", "MacDonald", "Bergeron", "Kim", "Girard", "Taylor", "Belanger",
  "Ahmed", "Lapointe", "Brown", "Caron", "Sato", "Cote", "Martel", "Clarke", "Dubois", "Sharma",
  "Gill", "Tanaka", "Whitebear", "Hassan", "Rahman", "Garcia", "Rossi", "Okafor", "Larsen", "Aziz",
  "Zhang", "Murphy", "Kapoor", "Lefebvre",
];

export interface PersonaDef {
  key: string;
  firstName: string;
  lastName: string;
  dob: string;
  addressIndex: number;
  scenario: string;
}

export const PERSONAS: PersonaDef[] = [
  { key: "emma", firstName: "Emma", lastName: "Tremblay", dob: "1990-04-12", addressIndex: 0, scenario: "Happy path: all four account types, contacts, payees" },
  { key: "liam", firstName: "Liam", lastName: "Chen", dob: "1985-09-03", addressIndex: 5, scenario: "User currently locked out (an admin must unlock)" },
  { key: "olivia", firstName: "Olivia", lastName: "Singh", dob: "1994-01-27", addressIndex: 7, scenario: "Credit card $40 under its limit" },
  { key: "noah", firstName: "Noah", lastName: "Martin", dob: "2002-06-15", addressIndex: 3, scenario: "Brand-new customer, chequing only, no history" },
  { key: "ava", firstName: "Ava", lastName: "Roy", dob: "1978-11-30", addressIndex: 4, scenario: "Chequing account frozen by an admin" },
  { key: "lucas", firstName: "Lucas", lastName: "Gagnon", dob: "1988-02-08", addressIndex: 11, scenario: "Loan application in manual review, pending cheque deposit" },
];

/** 1x1 PNG, used for seeded cheque images. */
export const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
  "base64",
);
