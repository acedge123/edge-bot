# HEARTBEAT.md

# Keep this file empty (or with only comments) to skip heartbeat API calls.

# Add tasks below when you want the agent to check something periodically.

# --- When woken by inbound webhook (Composio trigger) ---
# If the wake text says something like "New Composio trigger received" or "new email":
# 1. Fetch the latest composio_trigger learnings: GET .../learnings/search?q=composio_trigger+gmail&limit=5 (base URL and Bearer $AGENT_EDGE_KEY from TOOLS.md).
# 2. Summarize the new trigger(s) for the user (e.g. "New email from X: subject Y").
# 3. If appropriate, act (e.g. reply, archive, or notify). Otherwise reply HEARTBEAT_OK after summarizing.
