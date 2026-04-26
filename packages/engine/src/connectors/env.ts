/**
 * Resolve `${ENV_VAR}` references inside connector config strings.
 *
 * Lets users put `"url": "postgres://${MAIN_DB_URL}"` in JSON without inlining
 * secrets, while still keeping the JSON file valid plain JSON.
 *
 * Returns `undefined` when ALL env vars referenced are unset (so callers can
 * decide to soft-fail vs throw).
 */
export function resolveEnvString(input: string | undefined): string | undefined {
  if (!input) return undefined;
  let missing = 0;
  let referenced = 0;
  const out = input.replace(/\$\{([A-Z0-9_]+)\}/g, (_, name) => {
    referenced += 1;
    const value = process.env[name];
    if (value == null || value === "") {
      missing += 1;
      return "";
    }
    return value;
  });
  if (referenced > 0 && missing === referenced) return undefined;
  return out;
}

export function resolveEnv(value: string | undefined): string | undefined {
  return resolveEnvString(value);
}
