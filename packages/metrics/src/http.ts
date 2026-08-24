import { Histogram } from 'prom-client';
import { registry } from './registry.js';

export const httpDuration = new Histogram({
  name: 'autmn_http_request_duration_seconds',
  help: 'HTTP request duration',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [registry],
});

/**
 * Records the Fastify route pattern rather than the resolved URL. Labelling by
 * raw path would mint a new time series per order id and blow up cardinality,
 * which is the classic way a metrics endpoint takes down the thing it monitors.
 */
export function observeRequest(
  method: string,
  routePattern: string | undefined,
  status: number,
  seconds: number,
): void {
  httpDuration.labels(method, routePattern ?? 'unmatched', String(status)).observe(seconds);
}
