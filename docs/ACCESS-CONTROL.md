# STS GeoFlow access control

## Status

The access-control implementation is present in the local sandbox. Cloudflare enforcement remains deliberately disabled in `wrangler.jsonc` until the Access application, audience tag, bootstrap Director, and Android authentication path are configured and approved.

The implemented model is **hierarchical role-based access control with project-level permissions and approval workflows**.

## Roles

| Role | Project scope | Primary authority |
| --- | --- | --- |
| Director | All projects | Full company, finance, tender, user, report and approval authority |
| Admin | Assigned projects | Users, roles and system settings; no engineering approval by default |
| Engineering Manager | All projects | Assign teams, review engineering work and approve reports |
| Project Engineer | Assigned projects | Manage jobs, logs, samples, tasks and report preparation/review |
| Field Engineer | Assigned projects | Field records, boreholes, inspections, photos and samples |
| Laboratory Staff | Assigned projects | Samples, laboratory schedules and factual test results |
| Client | Assigned projects | Project status and specifically granted approved reports only |

User-level allow and deny exceptions are supported, but role changes should remain the normal administration path.

Engineering Managers and assigned Project Engineers can update project assignments and responsibility chains without receiving organisation-wide user-policy authority. Admins can manage standard users and feature exceptions, but cannot alter a Director, grant company-wide engineering authority, change their own role or permissions, grant approval/finance/tender exceptions, or rebind a project to another KV record. Project record bindings remain Director-controlled.

## Enforcement layers

1. The browser hides or disables inaccessible modules and actions.
2. The Worker validates the `Cf-Access-Jwt-Assertion` signature, issuer, audience, expiry, token type and verified email.
3. The verified email is mapped to an active STS GeoFlow user in the server policy.
4. Feature permission and project assignment are checked for every protected API request.
5. Each logical project ID is bound to one KV record key. Supplying another project's record key is rejected.
6. Report files are filtered by permission. Clients receive only explicitly granted reports with a server-owned `Approved` workflow.
7. Prepare, review and approve are server transitions. The same person cannot prepare and review, prepare and approve, or review and approve the same revision.
8. An in-review, reviewed or approved PDF cannot be overwritten through the file endpoint.

This is Worker-enforced record-level security over Workers KV, not database-native SQL RLS. Approval state is stored separately from the editable project-state blob so client-side data cannot manufacture an approval.

## Cloudflare configuration

Create a Cloudflare Access self-hosted application for the GeoFlow Worker hostname. Cloudflare documents that Workers behind Access must still validate the JWT in `Cf-Access-Jwt-Assertion`; the Worker follows that requirement and resolves the signing key by `kid` from the team JWKS.

Required Worker variables:

```text
ACCESS_ENFORCEMENT=enabled
TEAM_DOMAIN=https://<team-name>.cloudflareaccess.com
POLICY_AUD=<Access application audience tag>
ACCESS_BOOTSTRAP_DIRECTOR_EMAIL=<initial-director@sts-domain>
```

Do not store these values in browser local storage. `POLICY_AUD` is configuration rather than a password, but it must match the protected Access application. The bootstrap email should be removed after the first policy has been created.

Cloudflare references:

- https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/
- https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/application-token/
- https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/cors/

## Activation sequence

1. Configure the identity provider and Access application for the Worker hostname.
2. Add the four Worker variables, leaving `ACCESS_ENFORCEMENT=disabled` during setup.
3. Verify every STS staff email and the initial Director email.
4. Open GeoFlow as the bootstrap Director and confirm `/api/v1/access/me` succeeds.
5. Register all users, project assignments, project record bindings and responsibility chains.
6. Verify Field Engineer, Project Engineer, Engineering Manager, Client and Admin test identities.
7. Complete the Android authentication gate below.
8. Set `ACCESS_ENFORCEMENT=enabled`, deploy to a non-production Worker first, and run the access test matrix.
9. Promote only after the access audit and report workflow checks pass.

## Protected API surface

| Endpoint | Protection |
| --- | --- |
| `GET /api/v1/access/me` | Verified identity and effective policy |
| `GET/PUT /api/v1/access/policy` | User and role management permission; role-escalation checks |
| `GET /api/v1/projects` | Assigned or company-wide project directory |
| `GET/POST /api/v1/geologger/logs` | Field view/edit plus bound project record |
| `GET/POST /api/v1/files` | Document/report permission, project binding and client report grant |
| `GET/POST /api/v1/reports/workflows` | Server-owned report state and separation of duties |

## Android activation gate

The existing Capacitor app uses a shared API key and local `https://localhost` origin. Shared API keys do not provide per-person RBAC, so the Worker intentionally does not accept that key as a bypass when Access enforcement is enabled.

Before production activation, the Android app needs an interactive identity flow that produces a Cloudflare-verified user request. The assigned-project directory and project headers are already supported in the field UI, but authentication still needs device testing. Keep enforcement disabled until that path is complete; otherwise the native app will remain offline-only by design.

## Residual platform note

Workers KV is eventually consistent. Permission checks and separation of duties remain server-enforced, but a later hardening phase should place approval transitions and audit events in a strongly consistent Cloudflare primitive such as a Durable Object if concurrent controlled issue becomes common.
