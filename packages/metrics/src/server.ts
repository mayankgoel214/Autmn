import { createServer, type Server } from 'node:http';
import { metricsContentType, renderMetrics } from './registry.js';

/**
 * The worker has no HTTP server of its own, but Prometheus only pulls. This is
 * the smallest thing that makes it scrapeable — deliberately not Fastify, since
 * a monitoring endpoint should not share a framework, a port, or a failure mode
 * with the thing it reports on.
 */
export function startMetricsServer(port: number): Server {
  const server = createServer((req, res) => {
    if (req.url !== '/metrics') {
      res.writeHead(404).end();
      return;
    }
    renderMetrics()
      .then((body) => {
        res.writeHead(200, { 'Content-Type': metricsContentType() }).end(body);
      })
      .catch(() => {
        res.writeHead(500).end();
      });
  });

  server.listen(port, () => {
    console.log(JSON.stringify({ event: 'metrics_server_listening', port }));
  });
  return server;
}
