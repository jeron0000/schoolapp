# SR-2 authentication and session policy

All three login routes retain their existing request/response shape and `token`
header. Tokens are signed and verified with HS256 only. Claims are exactly
`sub`, `role`, `iat`, and `exp`; no email, password, hash, credential string or
signing key is included. Customer subjects are user IDs; Cashier subjects are
user IDs; the single configured administrator uses the nonsecret `pamo-admin`
subject. Administrator credentials must be configured and match before issuance.

The shared policy permits a maximum of seven days for customers and eight hours
for administrators/Cashiers. It rejects expired, expiryless, credential-bearing,
malformed, future-issued, overlong and unsupported tokens. There is no refresh
token, legacy fallback, previous-key verification or environment bypass.
The NumericDate and algorithm behavior follows [RFC 7519](https://www.rfc-editor.org/rfc/rfc7519)
and the [jsonwebtoken verification API](https://github.com/auth0/node-jsonwebtoken#jwtverifytoken-secretorpublickey-options-callback).

Customer routes accept only customer claims and overwrite caller `userId` with
the signed subject. Administrator routes accept only the administrator identity.
Cashier routes accept administrators or Cashier claims plus the existing current
database Cashier-role lookup on every request. Deletion/downgrade remains denied.
Public registration never accepts a role. Public login issues the stored role;
a Cashier account cannot obtain a seven-day customer session by choosing that UI.

Missing/invalid authentication returns HTTP 401 with a generic reauthentication
message. Authenticated wrong-role requests return 403. Cashier access denial
keeps its existing 403 contract. SR-1 payment containment remains unchanged.
Inventory, payments, order ownership and business rules are unchanged.

## Browser compatibility

Both applications keep their current localStorage architecture and opaque
`token` header. Shared session handling decodes claims only for UX; browser
decoding is not signature verification or an authorization decision. Restored
legacy/expired/malformed/wrong-app tokens are removed. Expiry, tab activation and
matching-token backend 401 responses end the session and require a fresh login.
Public login failures, stale responses, unrelated origins and general 403/network
errors do not clear a newer session. Staff access-check 403 denial requires
reauthentication. Student private cart state is cleared on logout/invalidation;
late cart/access responses cannot restore a superseded session's data.

Student recovery opens the existing Student Login. Staff recovery opens the
selected PAMO/Cashier login before mounting the cross-app redirecting login
component. Authentication V3 markup/styles, passwords/visibility controls and
navigation patterns are unchanged. Manual logout remains available.

## SR-6B1 authentication/API hardening

Credential types, own properties and bounded email length are checked before
account queries. Registration additionally checks email format and password
policy before lookup. Unknown accounts and incorrect login passwords receive
the same existing response envelope/status and generic message; missing accounts
also perform a dummy bcrypt comparison. This reduces timing differences but is
not a claim of constant-time authentication across every account/hash cost.
Duplicate registrations and internal registration failures share a generic
response. Successful registration still signs the customer in, so registration
cannot provide complete account-enumeration resistance without changing that contract.

New passwords retain the existing eight-character minimum and must fit within
72 UTF-8 bytes. Login deliberately accepts historical longer bcrypt passwords;
no rehash, truncation preprocessing, normalization or account migration is added.
Configured Admin passwords retain exact string comparison and are not bcrypt passwords.

All three authentication routes share a local per-IP budget of 20 failed or
in-flight attempts per 60 seconds. A successful response refunds only its own
attempt. Rejections use HTTP 429, a generic message and Retry-After. Forwarded
headers are not trusted by the existing Express configuration. The map holds
at most 1,000 clients, expires entries lazily and uses no background timers.
This is single-process protection for a local-only project: restart resets it,
shared-IP users share a budget, and it is not distributed brute-force protection.

Previously raw product/order exception responses now use fixed safe messages
and do not log caught exceptions. Business logic, existing response envelopes
and status conventions remain unchanged; untyped failures intentionally no
longer reveal their underlying validation/driver message. A final Express error
handler sanitizes parser, upload and unexpected errors without replacing the
existing Hero-specific handler. Payment/inventory logic and JWT policy are unchanged.

Run `node --test tests/authApiHardening.test.js` for synthetic negative,
boundary-password, legacy-password, throttle/concurrency and error-disclosure
coverage. No actual credential replacement or provider/database access is needed.

## Operational follow-up — not executed

Code changes do not repair credentials previously exposed in Git or admin JWTs.
The SR-0 exposure findings require a separately authorized credential inventory
and rotation: JWT signing secrets, administrator credentials, database access,
Stripe/PayPal credentials, Cloudinary credentials, and any additional secrets
confirmed in that inventory. Never paste values into logs, tickets or Git.

1. Coordinate an incident/deployment window and inventory environments, secret
   stores, consumers and exposed credential types. Restrict any affected live
   deployment while compromised signing/admin credentials remain usable. Keep
   online payments contained and preserve orders/reservations for review.
2. Prepare the hardened backend and both compatible frontends in isolated staging;
   verify authentication, Cashier role revocation, COD and SR-1 rejection with
   synthetic data. No production reconciliation is authorized by SR-2.
3. Replace the exposed administrator credential and JWT signing secret through
   approved secret-management channels; use an independently generated strong
   signing secret. Coordinate all backend instances and deploy both frontends.
   Invalidate all old sessions. Never retain the exposed key as a fallback.
4. Rotate/revoke exposed database, payment-provider and Cloudinary credentials
   with each service owner. Update dependent secret stores, validate minimal
   access/connectivity, then revoke old credentials. Coordinate payment keys
   without re-enabling checkout or initiating a live payment.
5. Verify every instance rejects legacy/old-key tokens, all roles can sign in,
   and Cashier/COD/inventory contracts remain correct. Monitor generic auth
   failures without logging tokens. Rollback must retain strict verification
   and SR-1 containment. Handle historical Git cleanup separately.

Administrator password changes alone no longer invalidate issued JWTs because
credentials are absent from the payload. Existing admin sessions expire within
eight hours; immediate invalidation requires coordinated signing-key rotation.
Customer sessions remain stateless, local logout removes only the browser copy,
and stolen valid tokens can be replayed until expiry/key rotation. localStorage
XSS exposure remains; cookie/refresh/revocation architecture is outside SR-2.

## Verification

Run `node --test tests/*.test.js` from backend with all `PAMO_*_INTEGRATION` flags
disabled. Tests use synthetic credentials, mocked models and loopback HTTP.
Run `node --test tests/authSession.test.js tests/paymentContainment.test.js` from
frontend, each application's existing `npm run lint`, and their existing Vite
builds. Integration flags must not be enabled against production resources.
