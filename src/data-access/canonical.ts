/**
 * JSON with object keys sorted, so two values compare equal exactly when their
 * contents are equal, whatever order their properties were built in. Array
 * order is preserved: it is meaningful.
 */
export const canonicalJson = (value: unknown): string =>
  JSON.stringify(value, (_key, item: unknown) =>
    item !== null && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item as Record<string, unknown>).sort(([a], [b]) =>
            a < b ? -1 : a > b ? 1 : 0,
          ),
        )
      : item,
  );
