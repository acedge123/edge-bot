# Agent Web Search & Surf Skills – Research

**Goal:** Make the agent (Cursor and/or OpenClaw Edge bot) able to **search the web** and **fetch/surf URLs** so it’s less limited.

---

## 1. Cursor (this IDE) – MCP servers

The Cursor agent can already use built-in `web_search` and `mcp_web_fetch`. To give it **more** power (better search, robust fetch), add MCP servers in **Cursor Settings → Features → MCP** (or edit `mcp.json`).

### A. Web search – Tavily MCP (recommended)

- **What:** Real-time web search + optional content extraction.
- **Tools:** `tavily_search`, `tavily_extract`.
- **Setup:** [Tavily MCP docs](https://docs.tavily.com/documentation/mcp). Free API key at [tavily.com](https://www.tavily.com/).

**Remote (no local install):**

```json
{
  "mcpServers": {
    "tavily-remote-mcp": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://mcp.tavily.com/mcp/?tavilyApiKey=YOUR_TAVILY_API_KEY"],
      "env": {}
    }
  }
}
```

**Local (with API key in env):**

```json
{
  "mcpServers": {
    "tavily-mcp": {
      "command": "npx",
      "args": ["-y", "@tavily/mcp"],
      "env": {
        "TAVILY_API_KEY": "tvly-YOUR_API_KEY"
      }
    }
  }
}
```

### B. URL fetch – Official Fetch MCP

- **What:** Fetch any URL, get content as markdown (or raw).
- **Tool:** `fetch` (URL + optional `max_length`, `start_index`, `raw`).

**Config:**

```json
{
  "mcpServers": {
    "fetch": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-fetch"]
    }
  }
}
```

### C. Alternative search – Brave Search MCP

- **What:** Web, image, news search (own index).
- **Tools:** `brave_web_search`, `brave_image_search`, `brave_news_search`.
- **Pricing:** Free tier ~2,000 queries/month; [Brave Search API](https://brave.com/search/api).

Use a Brave MCP server from npm or community (e.g. search “brave mcp” on GitHub) and add it the same way as Tavily.

### Summary for Cursor

| Need           | MCP server              | Config above |
|----------------|-------------------------|--------------|
| Web search     | Tavily (remote or local)| §1.A         |
| Fetch URL      | Official Fetch          | §1.B         |
| Extra search   | Brave Search MCP        | §1.C         |

After adding, restart Cursor or reload MCP so the agent can use the new tools.

---

## 2. OpenClaw Edge bot (Gateway + worker)

The **Edge bot** is: **OpenClaw Gateway** (`openclaw gateway --port 18789`) + **jobs worker** that POSTs to `/hooks/wake`. The agent that runs when woken uses **skills** (and no Cursor MCP). So to let the Edge bot “surf and search,” you need **skills** (or another way for the Gateway to call search/fetch).

### Option A: New OpenClaw skill – “web search” (Tavily/Brave/Serper)

- Add a skill (e.g. under `workspace/skills/` or your OpenClaw skills dir) that:
  - Is triggered when the user/agent wants to “search the web” or “look up X.”
  - Calls **Tavily API** (or Brave / Serper) via HTTP from Python or Node.
  - Returns a short summary + links (and optionally uses Tavily’s extract for one URL).
- **Tavily:** [API reference](https://docs.tavily.com/documentation/api-reference/introduction), free tier available.
- **Brave:** [Brave Search API](https://brave.com/search/api).
- **Serper:** [serper.dev](https://serper.dev) – Google search API, often used by agents.

Skill layout (example):

- `SKILL.md` – when to use (e.g. “User asks for current info, news, or to look something up”).
- `agent.py` or Node script – `requests.get` / `fetch` to Tavily/Brave/Serper, parse JSON, return text + URLs to the agent.

The Gateway already runs skills; no MCP needed on the OpenClaw side if you do it via a skill.

### Option B: “Fetch URL” skill for OpenClaw

- A small skill that, given a URL, fetches it (e.g. `requests.get` in Python or `node-fetch` in Node), optionally strips HTML to text/markdown, and returns the content to the agent.
- Lets the Edge bot “surf” specific pages when the wake payload or user message includes a URL.

### Option C: OpenClaw + MCP (if supported)

- If the OpenClaw Gateway or your stack supports **MCP clients** (connecting to MCP servers), you could run the same **Tavily** and **Fetch** MCP servers and point the Gateway at them. That would mirror Cursor’s setup. This depends on OpenClaw’s roadmap/docs; today the standard way is skills.

### Summary for Edge bot

| Goal              | Approach                          |
|-------------------|------------------------------------|
| Search the web    | New skill calling Tavily/Brave/Serper API (§2.A) |
| Fetch a URL       | New “fetch URL” skill (§2.B)      |
| Same as Cursor    | MCP only if Gateway supports it (§2.C) |

---

## 3. Quick reference – where things run

| Component        | Where it runs        | How it gets search/fetch      |
|-----------------|----------------------|-------------------------------|
| Cursor agent    | This IDE             | MCP: Tavily + Fetch (§1)      |
| Edge bot agent  | OpenClaw Gateway     | Skills: web-search + fetch-URL (§2) |
| Jobs worker     | Mac (daemon)         | Only claims jobs, POSTs to Gateway; no search |

---

## 4. Minimal “next steps”

1. **Cursor (so this agent is less limited)**  
   - Add **Tavily** MCP (§1.A) and **Fetch** MCP (§1.B) in Cursor MCP settings.  
   - Restart/reload MCP.

2. **Edge bot (so the bot that handles jobs can search/surf)**  
   - Add a **web-search** skill that calls Tavily (or Brave/Serper) API (§2.A).  
   - Optionally add a **fetch-url** skill (§2.B).  
   - Ensure the skill is in OpenClaw’s skill path and restart the Gateway.

If you tell me which you want first (Cursor only, Edge bot only, or both), I can outline the exact skill files (e.g. `SKILL.md` + `agent.py`) for the Edge bot or double-check your Cursor `mcp.json` layout.
