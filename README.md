# mcp-jpl-ssd

NASA/JPL Solar System Dynamics + CNEOS MCP.

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

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

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Jpl Ssd data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
