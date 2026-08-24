import { Registry, collectDefaultMetrics } from 'prom-client';

/**
 * One registry per process. Both the API and the worker expose it on /metrics;
 * the `service` label is what separates them once Prometheus has scraped both.
 */
export const registry = new Registry();

let started = false;

/** Idempotent: calling this twice in one process would double-register. */
export function initMetrics(service: 'api' | 'worker'): void {
  if (started) return;
  started = true;

  registry.setDefaultLabels({ service });
  // Event-loop lag matters here: the image pipeline used to run tight pixel
  // loops on the loop, and lag is how that shows up before users notice.
  collectDefaultMetrics({ register: registry });
}

export function metricsContentType(): string {
  return registry.contentType;
}

export function renderMetrics(): Promise<string> {
  return registry.metrics();
}
