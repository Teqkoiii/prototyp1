# DHBW sign-in integration

The supplied Moodle link starts a Moodle sign-in flow through a SimpleSAMLphp discovery page. Its `AuthState` query value belongs to that flow and must not be reused or stored. It is not the stable SAML metadata or callback configuration for this application.

## What is needed for real SSO

DHBW or the responsible identity-provider/federation administrator must register this application as its own SAML 2.0 Service Provider. The application then needs a stable public HTTPS URL and an approved Assertion Consumer Service (ACS) endpoint. The identity provider and application must exchange trusted SAML metadata.

Before implementation can be enabled, obtain and verify:

- The identity-provider entity ID, SSO endpoint, and signing certificate or signed metadata URL.
- The application's entity ID, ACS URL, and signing/encryption requirements approved by the DHBW administrator.
- The exact released identity attributes and their meaning, including a stable user identifier and, if authorized, campus affiliation and role.
- The production hostname and TLS/session requirements.

The app must validate SAML signatures, issuer, audience, destination, time conditions, request correlation, and replay protection on the server. Sessions must use secure, HTTP-only cookies. Do not derive employee permissions from the email text or allow a user to select their own role/campus.

The current UI remains in demo mode and does not authenticate anyone. The supplied personal Gmail address is not treated as a DHBW identity or used as an account. No password, assertion, metadata, or transient `AuthState` value belongs in browser storage, Git, or this repository.

See the [SimpleSAMLphp service-provider setup guide](https://simplesamlphp.org/docs/stable/simplesamlphp-sp.html) for the provider metadata exchange model.
