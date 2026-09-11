# MCP Plugin

Claude Code plugin that exposes a REST API as MCP tools, with JWT authentication (automatic login + token renewal) via a Node.js stdio server.

## Requirements

- Node.js 18+

## Installation

```bash
cd mcp-server
npm install
```

## Configuration

Environment variables:

| Variable | Required | Description |
|---|---|---|
| `API_BASE_URL` | yes | API base URL (including version, if applicable) |
| `API_TOKEN` | no* | Ready-to-use JWT token |
| `AUTH_BASE_URL` | no* | Base URL of the login endpoint |
| `AUTH_API_KEY` | no* | Bearer token required by the login endpoint |
| `OXFORD_USER` / `OXFORD_PASSWORD` / `OXFORD_ACCOUNT` | no* | Credentials for automatic login |
| `NODE_EXTRA_CA_CERTS` | no | Path to an extra CA certificate, if the network does SSL inspection |

\* Set `API_TOKEN` **or** the set `AUTH_BASE_URL` + `AUTH_API_KEY` + `OXFORD_USER` + `OXFORD_PASSWORD` + `OXFORD_ACCOUNT`. With automatic login, the server calls `POST {AUTH_BASE_URL}/User/login`, caches the JWT in memory, and renews it on expiry or on a 401 response.

Never commit credentials — always set them via environment variable (shell or a `.env` file outside version control).

## Local usage (dev)

```bash
claude --plugin-dir <project-path>
```

## Installing as a plugin

```bash
claude plugin marketplace add <project-path>
claude plugin install <plugin-name>@<marketplace-name>
```

- `plugin.json` and `marketplace.json` live under `.claude-plugin/` (required by `claude plugin validate`).
- An installed plugin runs from a **cached copy**, not the source directly. After editing `index.js`, reinstall (`uninstall` + `install`) or bump the version in `plugin.json` and run `claude plugin update` to force a reload.
- Always test in a new conversation — a running MCP server doesn't reload code on its own.

## Troubleshooting

- A newly set environment variable only applies to processes started **after** the change — close and reopen the terminal/app.
- Packaged apps (e.g., Microsoft Store/MSIX) may not pick up the environment even after restarting — if so, log off/log back into the OS.
- `fetch failed (cause: SELF_SIGNED_CERT_IN_CHAIN)`: the network does corporate SSL inspection. Set `NODE_EXTRA_CA_CERTS` to the CA certificate path. If `${NODE_EXTRA_CA_CERTS}` interpolation doesn't resolve in `plugin.json`'s `env` block (some hosts filter out `NODE_`-prefixed variables), use the literal path value instead of the reference.

## Write/destructive tools

Tools marked `[ESCRITA]` (write) or `[DESTRUTIVO]` (destructive) in their description prompt for confirmation before running — this helps Claude act cautiously, but it isn't a technical guarantee. To block them entirely, remove the corresponding entry from the `TOOLS` array in `mcp-server/index.js`.

## Security

- Never put a token/password directly in `plugin.json` — always use an environment variable.
- Each person should use their own credential, respecting the permissions the API already enforces.
