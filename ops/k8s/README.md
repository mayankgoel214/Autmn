# Kubernetes manifests

```bash
kubectl apply -f base/config.yaml     # once, with real values in the Secret
kubectl apply -k base                 # everything else
```

`config.yaml` is applied separately and left out of the kustomization on
purpose: it carries the Secret template, and rolling it in would overwrite live
credentials with `REPLACE_ME` on every apply.

## The decisions worth knowing

**The worker autoscales on queue depth, not CPU.** The obvious HPA would target
CPU and would never fire — an image job spends nearly all of its seven minutes
awaiting Gemini, fal.ai and object storage, so CPU sits low precisely while the
backlog grows. KEDA reads `autmn_queue_depth` from Prometheus instead, which is
the metric that actually tracks the problem. Threshold is 3 waiting jobs,
because each worker runs 3 concurrently — revisit it if that changes.

**The worker gets a 10-minute termination grace period.** BullMQ holds a job
lock for ten minutes. Killing a pod mid-job means nothing else can pick that
job up until the lock expires, so eviction is given time to finish first.

**The worker has no readiness probe.** It serves no traffic, so there is no
Service routing to gate. Liveness points at the metrics port, the only thing it
listens on.

**Liveness and readiness differ deliberately on the API.** They hit the same
endpoint but mean different things: readiness pulls a pod out of the Service,
liveness restarts it. The liveness probe is far more forgiving, because
restarting a pod that is merely slow makes an overload worse.

**`imagePullPolicy: IfNotPresent` and a pinned tag.** A `:latest` tag makes
Kubernetes default to `Always`, which fails outright against an image
side-loaded into a local cluster and pulls needlessly in production. The tag is
set in one place — the `images:` block in `kustomization.yaml` — so a production
overlay can pin an immutable build tag and make rollback unambiguous.

**A PodDisruptionBudget on the API.** Meta retries webhook delivery, but a gap
during a rollout still surfaces as delayed messages to customers.

## How these were verified

Applied to a real cluster (`kind`), not dry-run:

- All seven resources accepted by the API server.
- The ScaledObject validated against KEDA's actual CRD schema, not just as YAML.
- The image side-loaded and the pods started, confirming the containers run
  under `runAsNonRoot` with uid 1000. They then crash-loop on env validation
  rejecting the placeholder secrets, which is the correct behaviour and is how
  the full required key list in `config.yaml` was established — by reading what
  the running service rejected, rather than by reading the schema and hoping.

KEDA itself is required in the cluster:

```bash
helm repo add kedacore https://kedacore.github.io/charts
helm install keda kedacore/keda --namespace keda --create-namespace
```
