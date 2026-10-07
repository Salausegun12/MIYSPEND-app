const TS_LIKE = /\.[cm]?[jt]sx?$/;

/**
 * Node's ESM resolver requires explicit file extensions, but the app uses the
 * extensionless relative imports Metro expects. Before falling back to the
 * default resolution, retry extensionless relative specifiers as `.ts` so the
 * real source files load under `--experimental-strip-types`.
 */
export async function resolve(specifier, context, nextResolve) {
  const isRelative =
    specifier.startsWith("./") || specifier.startsWith("../");
  if (isRelative && !TS_LIKE.test(specifier)) {
    try {
      return await nextResolve(`${specifier}.ts`, context);
    } catch {
      // Not a sibling .ts file; let the default resolver try the original.
    }
  }
  return nextResolve(specifier, context);
}
