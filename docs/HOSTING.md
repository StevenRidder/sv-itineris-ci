# Hosting decision

Start with the local private pilot. For access while travelling, a dedicated
small VM is the preferred next step. The model runs remotely through Codex; the
VM serves FastAPI, static assets, SQLite and its Codex adapter, so no GPU is needed.

An initial sizing estimate is 2 vCPU / 2 GB RAM, with builds in CI rather than on
the VM. AWS Lightsail currently lists a Linux IPv4 bundle at USD 12/month with
2 GB RAM, 60 GB SSD and transfer allowance. Backups, taxes, regional exceptions
and excess usage are extra. Verify the chosen region and current offer before
provisioning. This is an estimate, not measured app capacity.

Reuse of an existing non-critical tools host can have little incremental compute
cost, but only after checking memory, disk, process isolation, backups and access
boundaries. Run a separate Unix user/service/container and independent data
directory. Avoid customer production, databases and shared production credentials.
A paid load balancer, RDS or Kubernetes is unnecessary for this pilot.

Before any remote deployment: authenticated private access and HTTPS, secure
subscription sign-in for that host, process supervision, a deliberately approved
private guide import, persistent storage, tested SQLite/asset backup and restore,
and a protected exact-SHA deployment path are required. The current loopback
Host/Origin boundary must not simply be opened. Do not clone laptop credentials
or the iCloud library to a shared VM as an ad hoc deployment.

The VM must have its own supported Codex sign-in/session. Official SIWC guidance
also describes a self-hosted VM credential transfer flow for eligible apps, with
host identity and refresh ownership; evaluate that separately before implementing
it. Local subscription success does not establish hosted eligibility or access.

Public Wix replacement should be a separate public projection of approved
content, while guides, planning chat and voyage options stay authenticated.
This change neither provisions AWS nor changes the public domain.

References checked for this proposal:
- https://aws.amazon.com/lightsail/pricing/
- https://developers.openai.com/siwc/token-sharing-open-source/self-hosted-vms
