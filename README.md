# opencode-webhook-plugin

Discord notifications for completed / failed opencode sessions.

## What it does

Listens to opencode bus events and posts to a Discord webhook:

- `session.idle` → `Response completed`
- `session.error` → `Session error`

It swallows every failure (network timeouts, aborts, malformed events) — a
notification must never crash the opencode session worker.

### Built-in safeguards

- **Dedup** — repeat notifications for the same session are suppressed for
  60s (opencode can emit `session.idle` several times per turn).
- **Subagent filtering** — sessions spawned as subagents (`parentID` set) are
  skipped, so a plan that fires a `task-runner` per step does not spam Discord.
- **8s timeout** with abort on all requests.
- **Never throws** — every hook is wrapped so failures are silently ignored.

## Requirements

The only requirement is the webhook URL, read from the
`DISCORD_WEBHOOK_URL` environment variable. There is no other configuration.

How you make it available depends on your environment; common ways:

```sh
# in the shell that launches opencode
export DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/..."

# in ~/.bashrc / ~/.zshrc so login shells inherit it
echo 'export DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/..."' >> ~/.bashrc

# or a dotenv plugin that injects into process.env before this plugin runs
```

If `DISCORD_WEBHOOK_URL` is unset or empty, the plugin silently does nothing.

The URL is a secret token — never hardcode it in this repo or commit it.

## Install

There is no npm package; install straight from the GitHub repo.

### Option A — reference the repo from `opencode.json`

OpenCode clones it via Bun at startup (git dependency, no npm registry):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["github:SpiralSky/opencode-webhook-plugin"]
}
```

Pin a tag for reproducible installs: `github:SpiralSky/opencode-webhook-plugin#v0.1.0`.
Updates come from reinstalling (e.g. bump the pinned tag).

### Option B — clone and register the file directly

```sh
git clone https://github.com/SpiralSky/opencode-webhook-plugin ~/opencode-webhook-plugin
```

Then either reference the entry file:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["/abs/path/to/opencode-webhook-plugin/webhook-plugin.js"]
}
```

or copy `webhook-plugin.js` into `.opencode/plugins/` (or
`~/.config/opencode/plugins/`) — files there are auto-discovered, no config
needed.

After installing, set `DISCORD_WEBHOOK_URL` (see Requirements) and restart
opencode.

## Configuration

| Env var                | Required | Effect                    |
| ---------------------- | -------- | ------------------------- |
| `DISCORD_WEBHOOK_URL`  | Yes      | Discord webhook to POST to. Unset/empty = plugin silently inactive. |

## Hooks used

| Hook    | Purpose                                            |
| ------- | -------------------------------------------------- |
| `event` | Observe `session.created`, `session.deleted`, `session.idle`, `session.error`. |

No runtime dependencies. `@opencode-ai/plugin` is a dev dependency for editor
type-checking only; the plugin file itself imports nothing.