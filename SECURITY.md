# Security Policy

## Supported Scope

This repository is a hackathon MVP and open-source WebMCP reference app powered by Adaptive Contract MCP. The supported security boundary is:

- browser-side WebMCP tools are read-only or proposal-only;
- parsed item review is merchant-only and only allowed before Customer Publishing and customer confirmation;
- structural ReviewGate findings must be edited or removed before customer publishing;
- humans keep final control over customer choices, final order summaries, payment, bookings, and external submissions;
- provider adapters are extension-only deployment-owner features and are never required for the no-key WebMCP demo;
- room persistence is local JSON for a single demo instance, or a platform-mounted volume when deployed.

## Secret Handling

Do not commit API keys, provider credentials, `.env` files, service accounts, private keys, cookies, or payment data. Use deployment environment variables or the hosting provider secret manager.

If a secret is accidentally committed:

1. rotate the provider-side credential;
2. remove the value from source;
3. run current-file and Git-history secret scans;
4. coordinate any required history rewrite as a separate reviewed operation.

## Reporting

Open a GitHub issue with a minimal reproduction and no secret values. Do not include private room data, payment data, personal contact details, or provider credentials in reports.
