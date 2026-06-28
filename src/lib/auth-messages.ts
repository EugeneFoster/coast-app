export const LOGIN_ERRORS = {
  missingFields: "Enter email and password.",
  invalidCredentials: "Invalid email or password.",
  unavailable: "Sign in is temporarily unavailable. Please try again later.",
} as const;

export function toLoginError(
  error: unknown,
  fallback: string = LOGIN_ERRORS.unavailable,
): string {
  const message = error instanceof Error ? error.message.toLowerCase() : "";

  if (message.includes("invalid login credentials")) {
    return LOGIN_ERRORS.invalidCredentials;
  }

  return fallback;
}

export function sanitizeLoginErrorParam(error: string | undefined): string | null {
  if (!error) return null;

  const known = new Set<string>(Object.values(LOGIN_ERRORS));
  if (known.has(error)) return error;

  return LOGIN_ERRORS.unavailable;
}
