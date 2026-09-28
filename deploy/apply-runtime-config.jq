del(.agent)
| .agents.ownership = "explicit"
| .agents.defaults.model.primary = "openai/gpt-5.6-luna"
| .agents.defaults.model.fallbacks = ["openai/gpt-5.6-sol"]
| .agents.defaults.thinkingDefault = "low"
| .agents.defaults.workspace = "/app/.openclaw/workspace"
| .agents.defaults.heartbeat = {"every":"0m","agentId":"main"}
| .agents.defaults.contextInjection = "always"
| .agents.defaults.bootstrapMaxChars = 20000
| .agents.defaults.bootstrapTotalMaxChars = 150000
| .agents.defaults.startupContext = {"enabled":true}
| .agents.defaults.contextLimits = {"memoryGetMaxChars":6000,"postCompactionMaxChars":1200}
| .agents.defaults.contextPruning = {"mode":"cache-ttl","ttl":"5m","hardClear":{"enabled":true,"placeholder":"[Old tool result removed]"}}
| .agents.defaults.compaction = {"enabled":true,"mode":"safeguard","thinkingLevel":"low","keepRecentTokens":8000,"recentTurnsPreserve":2,"postIndexSync":"off","postCompactionSections":[],"maxActiveTranscriptBytes":"1mb","memoryFlush":{"enabled":false}}
| .agents.defaults.systemAgent.agentId = "main"
| .agents.entries = {
    "main":{"model":"openai/gpt-5.6-luna","workspace":"/app/.openclaw/workspace"},
    "main-light":{"model":"openai/gpt-5.6-luna","workspace":"/app/.openclaw/workspace"},
    "main-med":{"model":"openai/gpt-5.6-sol","workspace":"/app/.openclaw/workspace"},
    "main-critical":{"model":"openai/gpt-5.6-sol","workspace":"/app/.openclaw/workspace"}
  }
| .memory.search = {"enabled":true,"provider":"none","rememberAcrossConversations":false,"sources":["memory"]}
| .cron.enabled = false
| .cron.triggers.enabled = false
| .session.reset = {"mode":"idle","idleMinutes":60}
| .skills.allowBundled = []
| del(.skills.limits)
| .skills.workshop.autonomous.mode = "off"
| .discovery.mdns.mode = "off"
| .tools.deny = ["computer","sessions_spawn","subagents","automations","skill_workshop","canvas","image_generate","music_generate","video_generate","tts","nodes","node_exec","node_inference","mobile_ui","conversations_*","sessions_list","sessions_history","sessions_search","sessions_send","sessions_yield","agents_list","progress_card"]
| .plugins.entries["memory-core"].enabled = true
| .plugins.entries["memory-core"].config.dreaming.enabled = false
| .plugins.entries.brave.enabled = true
| .plugins.entries.codex.enabled = true
| del(.agents.list)
| del(.auth.profiles["openai:default"])
| del(.auth.order.openai)
| .hooks.enabled = true
| .hooks.token = "${OPENCLAW_HOOK_TOKEN}"
| .gateway.controlUi.allowedOrigins = [$origin]
| .gateway.http.endpoints.chatCompletions.enabled = true
| .gateway.http.endpoints.chatCompletions.images.allowUrl = true
| del(.gateway.controlUi.dangerouslyAllowHostHeaderOriginFallback)
