# TOOLS.md - Local Notes

Skills define _how_ tools work. This file is for _your_ specifics — the stuff that's unique to your setup.

## What Goes Here

Things like:

- Camera names and locations
- SSH hosts and aliases
- Preferred voices for TTS
- Speaker/room names
- Device nicknames
- Anything environment-specific

## Examples

```markdown
### Cameras

- living-room → Main area, 180° wide angle
- front-door → Entrance, motion-triggered

### SSH

- home-server → 192.168.1.100, user: admin

### TTS

- Preferred voice: "Nova" (warm, slightly British)
- Default speaker: Kitchen HomePod
```

## API calls with JSON bodies (curl)

When you need to send a JSON body in a curl request, **do not** try to put the JSON inside the shell command (quotes and escapes will break). Instead:

1. **Write the JSON to a temporary file** using the write tool (e.g. `/tmp/request-body.json`).
2. **Run curl** with `-d @/tmp/request-body.json` so the body comes from the file.
3. Use `$MOLTBOOK_API_KEY` in the Authorization header when calling Moltbook; the key is in your environment.

Example pattern for Moltbook POST: write a file with `{"submolt":"general","title":"...","content":"..."}`, then run:
`curl -s -X POST "https://www.moltbook.com/api/v1/posts" -H "Authorization: Bearer $MOLTBOOK_API_KEY" -H "Content-Type: application/json" -d @/tmp/request-body.json`

## Why Separate?

Skills are shared. Your setup is yours. Keeping them apart means you can update skills without losing your notes, and share skills without leaking your infrastructure.

---

Add whatever helps you do your job. This is your cheat sheet.
