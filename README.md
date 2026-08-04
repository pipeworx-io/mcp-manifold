# mcp-manifold

Manifold Markets MCP.

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

## Tools

| Tool | Description |
|------|-------------|
| `search_markets` | Search Manifold Markets prediction markets by topic or question text. Returns markets with current probability (for binary), trading volume, liquidity, bettor count, and resolution status. Manifold is a play-money venue with tens of thousands of user-created markets on any topic. Keyless. |
| `get_market` | Get full detail for a single Manifold market by its URL slug or id. Provide exactly one of slug/id. For multiple-choice markets, returns each answer with its probability (top 12). Includes plain-text description, creator, volume, liquidity, and resolution. Keyless. |
| `top_markets` | Most-active open Manifold markets right now — a live attention/demand signal for what the prediction-market crowd is trading. Optionally narrow to a topic. Returns compact market records sorted by popularity. Keyless. |

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "manifold": {
      "url": "https://gateway.pipeworx.io/manifold/mcp"
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
ask_pipeworx({ question: "your question about Manifold data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
