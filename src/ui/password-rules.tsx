"use client";
const RULES: [string, (p: string) => boolean, string][] = [
  ["length", (p) => p.length >= 8 && p.length <= 64, "8 to 64 characters"],
  ["upper", (p) => /[A-Z]/.test(p), "An uppercase letter"],
  ["lower", (p) => /[a-z]/.test(p), "A lowercase letter"],
  ["digit", (p) => /\d/.test(p), "A digit"],
  ["special", (p) => /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(p), "A special character, e.g. ! # $"],
];

export function PasswordRules({ password }: { password: string }) {
  return (
    <ul className="text-xs grid grid-cols-2 gap-1" data-testid="password-rules" aria-label="Password rules">
      {RULES.map(([key, test, label]) => {
        const met = test(password);
        return (
          <li key={key} data-testid={`password-rule-${key}`} data-met={met} className={met ? "text-success" : "text-muted"}>
            <span aria-hidden>{met ? "✓" : "○"}</span> {label}
          </li>
        );
      })}
    </ul>
  );
}
