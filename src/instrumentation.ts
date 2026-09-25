/**
 * Next.js instrumentation entry point.
 *
 * `register()` runs once per worker process at startup — wire any
 * OpenTelemetry SDK initialization here in a future iteration.
 *
 * `onRequestError()` is called by the framework for every unhandled error
 * that escapes a route handler, middleware, or server component. It gives us
 * a catch-all for errors that bypass individual route try/catch blocks.
 */

export async function register() {
  // OpenTelemetry SDK initialization goes here when a vendor is chosen.
}

export async function onRequestError(
  err: unknown,
  request: { path: string; method: string },
  context: { routerKind: string; routePath: string },
) {
  const { logEvent, classifyError } = await import("@/lib/telemetry");
  logEvent({
    correlationId: crypto.randomUUID(),
    route: context.routePath,
    operation: `${request.method} ${context.routePath}`,
    outcome: classifyError(err),
    serverError: err instanceof Error ? err.message : String(err),
  });
}
