# Security Policy

## Supported Scope

This repository is a hackathon MVP and open-source WebMCP template. The supported security boundary is:

- browser-side WebMCP tools are read-only or proposal-only;
- humans keep final control over claims, settlement, payment, bookings, and external submissions;
- provider keys are optional deployment-owner secrets and are never required for the no-key WebMCP demo;
- room persistence is local JSON for a single demo instance, or a host-mounted volume when deployed.

## Secret Handling

Do not commit API keys, provider credentials, `.env` files, service accounts, private keys, cookies, or payment data. Use deployment environment variables or the hosting provider secret manager.

If a secret is accidentally committed:

1. rotate the provider-side credential;
2. remove the value from source;
3. run current-file and Git-history secret scans;
4. coordinate any required history rewrite as a separate reviewed operation.

## Reporting

Open a GitHub issue with a minimal reproduction and no secret values. Do not include private room data, payment data, personal contact details, or provider credentials in reports.

