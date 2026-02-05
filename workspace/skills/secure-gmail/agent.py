"""
Secure Gmail skill for OpenClaw: Composio managed auth, least-privilege only.
Read and draft emails; cannot send or delete. No raw tokens on disk.
See: https://composio.dev/blog/secure-openclaw-moltbot-clawdbot-setup
"""

from pathlib import Path

# Load .env from skill dir or parent
skill_dir = Path(__file__).resolve().parent
env_path = skill_dir / ".env"
if env_path.exists():
    from dotenv import load_dotenv
    load_dotenv(env_path)
else:
    try:
        from dotenv import load_dotenv
        load_dotenv()  # e.g. ~/.openclaw/.env
    except Exception:
        pass

def get_composio_client():
    import os
    from composio import Composio
    if not os.environ.get("COMPOSIO_API_KEY"):
        raise RuntimeError("COMPOSIO_API_KEY not set. Add it to this skill's .env or ~/.openclaw/.env")
    return Composio()


def create_session(user_id: str = "openclaw_user"):
    """Create a Composio session with LEAST PRIVILEGE Gmail tools only."""
    composio = get_composio_client()
    session = composio.create(
        user_id=user_id,
        tools={
            "gmail": {
                "enable": [
                    "GMAIL_FETCH_EMAILS",
                    "GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID",
                    "GMAIL_CREATE_EMAIL_DRAFT",
                    "GMAIL_GET_PROFILE",
                ]
                # Explicitly NOT including GMAIL_SEND_EMAIL or GMAIL_DELETE_MESSAGE
            }
        },
    )
    return session


def get_gmail_tools(user_id: str = "openclaw_user"):
    """Return scoped Gmail tools for the agent (read + draft only)."""
    session = create_session(user_id=user_id)
    return session.tools()


if __name__ == "__main__":
    # Quick check: list tools
    tools = get_gmail_tools()
    print("Scoped Gmail tools:", tools)
