# EmmyTech Sales Document Runtime

The Sales commercial database stores immutable receipt, quotation and refund snapshots first. PDF rendering/email delivery is a separate recoverable process so a rendering or SMTP failure can never roll back a valid payment.

## Document flow

```text
Payment / quotation publish / refund
        ↓
Immutable sales_documents record
        ↓
Private PDF rendering
        ↓
Supabase Storage: sales-documents (private)
        ↓
Customer email + configured company archive email
        ↓
Delivery state / retry audit
```

Direct Sale payment actions attempt this processing immediately. Order/Repair payment database triggers always queue document metadata, so the background processor can recover/process documents even when the originating page is no longer open.

## LaTeX rendering

The document runtime supports two modes.

### Local/server pdflatex

If `SALES_LATEX_RENDER_URL` is not set, the server runs:

```text
pdflatex -interaction=nonstopmode -halt-on-error document.tex
```

Use `SALES_PDFLATEX_BIN` only if `pdflatex` is installed at a non-standard executable path.

Required LaTeX packages used by the supplied EmmyTech design include geometry, fontenc/inputenc, Noto Sans (`noto`), babel, booktabs, xcolor, tabularx, amsmath, graphicx and enumitem.

### Private remote renderer

For hosted environments without TeX, configure:

```text
SALES_LATEX_RENDER_URL=https://<private-renderer>/render
SALES_LATEX_RENDER_TOKEN=<secret bearer token>   # optional but strongly recommended
```

The app sends JSON:

```json
{
  "source": "<complete LaTeX source>",
  "assets": {
    "Emmytech2.png": "<base64 PNG>"
  }
}
```

The renderer must return the compiled PDF bytes with `Content-Type: application/pdf`. Do not expose an unauthenticated public compiler endpoint.

## SMTP email

Email is sent over implicit TLS SMTP. The app does not store mail credentials in the database.

Configure server environment variables only:

```text
SALES_SMTP_HOST=smtp.gmail.com
SALES_SMTP_PORT=465
SALES_SMTP_USER=<company mailbox>
SALES_SMTP_PASS=<app password / SMTP credential>
SALES_SMTP_FROM_EMAIL=<company mailbox>          # optional; defaults to SALES_SMTP_USER
SALES_SMTP_FROM_NAME=Emmy Technology             # optional
SALES_SMTP_HELO=emmytechnology.com               # optional
```

For Gmail/Google Workspace, use an approved app password or organization SMTP credential. Never commit the credential or paste it into source code.

The customer recipient comes from the immutable document delivery record. The company/archive recipient comes from `sales_settings.company_archive_email`.

## Supabase server credentials

Interactive staff processing uses the authenticated Sales/Admin client. The background worker reuses the repository's existing server-only Supabase Admin client and expects the existing environment configuration, including one of:

```text
SUPABASE_SECRET_KEY=<server secret key>
# or
SUPABASE_SERVICE_ROLE_KEY=<service role key>
```

The key is server-only and must never use a `NEXT_PUBLIC_` prefix.

## Background processor

Endpoint:

```text
GET/POST /api/sales/documents/process
```

Configure one secret:

```text
SALES_DOCUMENT_PROCESSOR_SECRET=<random long secret>
```

`CRON_SECRET` is also accepted when the deployment scheduler already provides it.

Call the endpoint with one of:

```text
Authorization: Bearer <secret>
```

or

```text
x-sales-document-secret: <secret>
```

Optional query parameter `?limit=10` processes up to 25 records in one invocation.

A production scheduler may call this endpoint every few minutes. Scheduler configuration is deployment-specific and is intentionally not hard-coded into the repository so local/testing environments do not accidentally start production-like recurring jobs.

## Private PDF access

PDFs are stored in the private Supabase bucket `sales-documents`.

Authenticated Sales/Admin staff use:

```text
/api/sales/documents/<document-id>
```

The route creates a short-lived signed Storage URL (5 minutes) and redirects to it. There are no permanent public PDF URLs.

## Failure semantics

- Payment success is never reversed because PDF rendering failed.
- Payment success is never reversed because email delivery failed.
- Failed renders store `sales_documents.render_error`.
- Failed email attempts store `sales_document_deliveries.last_error` and increment `attempt_count`.
- Receipts & Documents provides Process, Retry and Open PDF controls.
- Background processing picks up both pending renders and already-rendered documents with pending email deliveries.
- Void documents cannot render or resend.

## Templates

The supplied visual design is stored at:

```text
src/lib/sales/documents/templates/receipt.tex
src/lib/sales/documents/templates/quotation.tex
src/lib/sales/documents/templates/refund.tex
src/lib/sales/documents/templates/Emmytech2.png
```

Next.js output tracing explicitly includes this directory so the non-TypeScript assets are available in server deployments.
