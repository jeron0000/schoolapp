# Managed hero images — Phase 2

Backend only. The storefront continues to use the unchanged Phase 1 photograph;
there is no Admin manager, carousel, automatic migration, or seed data.

## Routes

All routes are under `/api/hero`. Management routes reuse the existing
`adminAuth` middleware and `token` header. Only the existing PAMO Admin token
is accepted; customer, Cashier, and forged role claims are rejected. The
middleware's existing denial response convention remains unchanged.

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/list` | Public | Active, non-deleting images |
| GET | `/admin/list` | PAMO Admin | All managed images, including inactive/pending |
| POST | `/add` | PAMO Admin | Upload a new image |
| PATCH | `/:id` | PAMO Admin | Update metadata |
| PATCH | `/reorder` | PAMO Admin | Reorder the complete managed list |
| DELETE | `/:id` | PAMO Admin | Deactivate, clean up the asset, delete the record |

Lists return `{ success: true, slides: [] }` when empty. Public entries contain
only `_id`, `imageUrl`, `altText`, and `sortOrder`. Admin entries additionally
contain `isActive`, `deletionPending`, `createdAt`, and `updatedAt`.
Neither contract exposes `imagePublicId` or provider credentials.

## Upload and metadata

`POST /add` accepts multipart data with exactly one `image` file and:

- `altText`: required non-empty, single-line string, up to 250 characters.
- `isActive`: optional `true`/`false` form value; defaults to **false**.
- `sortOrder`: optional non-negative safe integer; defaults to current maximum
  plus one, or zero for the first image.

JPEG, PNG, and WEBP are accepted up to **5 MiB**. The Hero-only Multer
configuration bounds file/field sizes, keeps the file in memory, and writes no
temporary files. MIME and signature must agree. Cloudinary must decode an image
in an allowed format with positive dimensions before persistence. The existing
Cloudinary configuration/SDK is reused; product uploads are unchanged.

The secure URL and canonical ID returned by Cloudinary are stored. Asset IDs
are server-generated UUIDs under `pamo/hero/`, with overwriting disabled;
deletion cannot be directed at arbitrary product/provider assets.

`PATCH /:id` accepts a JSON object containing one or more of `altText`,
`isActive` (a real boolean), and `sortOrder` (a real non-negative safe integer).
Asset identifiers/URLs and lifecycle flags cannot be supplied or replaced.
Pending deletion records reject edits/reactivation with 409.

## Ordering

Both lists sort by `sortOrder`, then `_id`. This also deterministically resolves
equal positions from explicit edits or concurrent appends; positions need not
be gapless after deletion.

`PATCH /reorder` accepts `{ orderedIds: ["<id>", ...] }` containing every managed
record exactly once. IDs are normalized/validated; duplicate, missing, or stale
lists fail. One MongoDB transaction assigns consecutive positions starting at
zero. It uses the project's existing transaction-capable MongoDB requirement;
there is no partial/non-transactional fallback. An empty list is a valid no-op
only when the collection is also empty.

## Cleanup and errors

Cloudinary and MongoDB are **not** atomic together. Failed/uncertain uploads
attempt cleanup using the server-generated asset ID. A failed database create
after upload also attempts compensation. A failure to confirm cleanup returns
an explicit error; its asset ID is logged without credentials for manual
Cloudinary investigation. A failure sending an already-saved response does not
delete that saved asset; refresh the managed list before retrying creation.

Deletion first atomically sets `isActive: false` and `deletionPending: true`.
Public reads exclude pending records, and metadata updates cannot reactivate
them during remote cleanup. Confirmed cleanup (`ok` or `not found`) is followed
by guarded database deletion. Any failure is reported, with the remaining
record kept inactive/pending so the same DELETE can be retried safely.
Already-missing records return 404. No automatic background repair occurs.

Feature failures use `{ success: false, message }`: 400 invalid input, 413
oversized upload/request, 404 missing record, 409 editing/order conflict,
502 provider/cleanup failure, and 500 database/unexpected server failure.
Raw database/provider details and credentials are never returned.

## Verification

Run `node --test tests/hero.test.js` from `backend`. Provider calls and database
operations are mocked in default tests; HTTP tests use a loopback Express app
with the real routes, authorization, and multipart middleware.

The optional `PAMO_HERO_INTEGRATION=1` test uses a fresh, uniquely named isolated
MongoDB database and mocked Cloudinary. It never populates the application
database and requires the same transaction-capable database configuration.
