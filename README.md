# mcp-jpl-ssd

NASA/JPL Solar System Dynamics + CNEOS MCP.

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1679+ live data sources.

## Tools

| Tool | Description |
|------|-------------|
| `get_small_body` | NASA/JPL Solar System Dynamics — look up an asteroid or comet by name or designation and return its orbit and physical parameters (eccentricity, semi-major axis, MOID, diameter, albedo, NEO/PHA flags). Keyless. |
| `close_approaches` | NASA/JPL CNEOS — list near-Earth close approaches to Earth in a date range, with miss distance (AU), relative velocity (km/s), and absolute magnitude (size proxy). Keyless. |
| `impact_risk` | NASA/JPL CNEOS Sentry — Earth impact risk for asteroids. Pass a designation for one object's cumulative impact probability, Palermo/Torino scale, diameter, and impact window; or omit it to list all currently-tracked objects above an impact-probability threshold. Keyless. |
| `recent_fireballs` | NASA/JPL CNEOS — most recent atmospheric fireballs/bolides detected by U.S. Government sensors, with date, radiated and total impact energy (kilotons of TNT), location, altitude, and velocity. Keyless. |

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "jpl-ssd": {
      "url": "https://gateway.pipeworx.io/jpl-ssd/mcp"
    }
  }
}
```

### What this endpoint actually serves

`tools/list` at `https://gateway.pipeworx.io/jpl-ssd/mcp` returns the tools in the table
above **plus the shared Pipeworx meta-tools** — `ask_pipeworx`,
`discover_tools`, `search_within`, `remember`/`recall` and the rest of the
gateway-wide set. So the tool count you see is larger than this table: a
single-pack endpoint currently lists roughly 30 shared tools alongside the
pack's own. The connection's `initialize` response states its exact scope, and
is the authoritative answer for a given day.

This is deliberate, not multiplexing by accident. The meta-tools are what let a
scoped connection answer a question this pack does not cover — via
`ask_pipeworx`, which routes across the whole catalog — without you adding a
second MCP server. There is currently no way to mount a pack endpoint without
them; if the extra schemas cost you more context than the routing is worth,
connect to the full gateway once rather than to several pack endpoints.

Or connect to the full Pipeworx gateway to get every pack's tools listed
directly, instead of just this one's:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

Both URLs reach the same gateway and the same 1679+ data sources. The
only difference is which pack's tools are listed **directly**; `ask_pipeworx`
reaches all of them from either one.

## No MCP client? Call it over HTTP

```bash
curl -X POST https://gateway.pipeworx.io/v1/tools/get_small_body \
  -H 'Content-Type: application/json' \
  -d '{"name":"Ceres"}'
```

No account needed for the first calls. Inspect any tool: `GET https://gateway.pipeworx.io/v1/tools/get_small_body`. Find one: `POST https://gateway.pipeworx.io/v1/tools/search_packs` with `{"query":"..."}`.

## Standalone (no gateway account)

This package also runs as a local stdio MCP server — no Pipeworx account, no
gateway round-trip:

```json
{
  "mcpServers": {
    "jpl-ssd": {
      "command": "npx",
      "args": ["-y", "@pipeworx/mcp-jpl-ssd"]
    }
  }
}
```

Or run it directly to confirm it starts:

```bash
npx -y @pipeworx/mcp-jpl-ssd
```

It speaks MCP over stdin/stdout and answers `initialize`/`tools/list`/`tools/call`
for **only** this pack's tools — none of the shared meta-tools the gateway
connection above adds. Same source, same tools, no ask_pipeworx routing.

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English —
this works on the pack endpoint above as well as on the full gateway:

```
ask_pipeworx({ question: "your question about Jpl Ssd data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
