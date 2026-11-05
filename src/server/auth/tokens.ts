import { SignJWT, jwtVerify } from "jose";

export const ACCESS_TTL_SECONDS = 15 * 60;
export const REFRESH_TTL_DAYS = 7;

const enc = (s: string) => new TextEncoder().encode(s);
const accessSecret = () => enc(process.env.JWT_SECRET ?? "local-dev-jwt-secret-change-me");

export interface AccessClaims {
  sub: string;      // user id
  sbx: number;      // sandbox id
  role: "CUSTOMER" | "ADMIN" | "INSTRUCTOR";
  sid: string;      // session id
  cid: number | null; // customer id
}

export async function signAccessToken(c: AccessClaims): Promise<string> {
  return new SignJWT({ sbx: c.sbx, role: c.role, sid: c.sid, cid: c.cid })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(c.sub)
    .setIssuer("ice-bank")
    .setAudience("ice-bank-api")
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
    .sign(accessSecret());
}

export async function verifyAccessToken(token: string): Promise<AccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, accessSecret(), { issuer: "ice-bank", audience: "ice-bank-api" });
    return {
      sub: String(payload.sub), sbx: Number(payload.sbx), role: payload.role as AccessClaims["role"],
      sid: String(payload.sid), cid: payload.cid === null || payload.cid === undefined ? null : Number(payload.cid),
    };
  } catch {
    return null;
  }
}
