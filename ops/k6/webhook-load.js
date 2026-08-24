import http from 'k6/http';
import { check } from 'k6';
import { Trend, Rate } from 'k6/metrics';

/**
 * Load test for the WhatsApp webhook — the system's only ingress.
 *
 * This endpoint is worth measuring because of what it does before it answers:
 * it persists the raw envelope before acknowledging, deliberately, so that a
 * crash or a rolling deploy cannot lose a message Meta has stopped retrying.
 * That puts a database write inside the acknowledgement path, and Meta gives
 * roughly 20 seconds before it treats the delivery as failed and backs off.
 *
 * So the question is not "how many requests per second" — the real traffic is
 * a few messages a minute. It is: when a burst arrives, does acknowledgement
 * still land well inside that window, and does the queue absorb the work.
 *
 *   docker compose run --rm k6 run /scripts/webhook-load.js
 */

const ackTime = new Trend('webhook_ack_ms', true);
const acked = new Rate('webhook_acked');

export const options = {
  scenarios: {
    // A burst, not a soak: this traffic is bursty by nature — one customer
    // sends six photos in ten seconds, not a steady stream.
    burst: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '10s', target: 5 },
        { duration: '20s', target: 20 },
        { duration: '20s', target: 20 },
        { duration: '10s', target: 0 },
      ],
      gracefulRampDown: '5s',
    },
  },
  thresholds: {
    // Meta's ceiling is ~20s. Anything approaching a second here means the
    // write path is the problem, so the threshold is set where it would still
    // be comfortably safe but the regression is already visible.
    'webhook_ack_ms': ['p(95)<1000'],
    'webhook_acked': ['rate>0.99'],
    'http_req_failed': ['rate<0.01'],
  },
};

const BASE = __ENV.BASE_URL || 'http://api:3000';

/** A text message envelope in the shape Meta actually posts. */
function envelope(vu, iter) {
  const phone = `9199${String(10000000 + (vu * 1000 + iter) % 89999999)}`;
  const stamp = Math.floor(Date.now() / 1000);
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{
      id: 'load-test-waba',
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: { display_phone_number: '911234567890', phone_number_id: 'load-test-phone-id' },
          contacts: [{ profile: { name: `Load Tester ${vu}` }, wa_id: phone }],
          messages: [{
            from: phone,
            id: `wamid.load.${vu}.${iter}.${stamp}`,
            timestamp: String(stamp),
            type: 'text',
            text: { body: 'hi' },
          }],
        },
      }],
    }],
  });
}

export default function () {
  const res = http.post(`${BASE}/webhooks/whatsapp`, envelope(__VU, __ITER), {
    headers: { 'Content-Type': 'application/json' },
    tags: { endpoint: 'whatsapp_webhook' },
  });

  ackTime.add(res.timings.duration);
  // Meta only stops retrying on a 2xx, so that is the thing to measure, not
  // whether the request merely completed.
  acked.add(res.status >= 200 && res.status < 300);

  check(res, {
    'acknowledged (2xx)': (r) => r.status >= 200 && r.status < 300,
    'well inside Meta\'s 20s window': (r) => r.timings.duration < 20000,
  });
}
