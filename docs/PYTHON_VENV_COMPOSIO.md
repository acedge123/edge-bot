# Python 3.11+ venv for Composio (fix TypeAlias error)

**Problem:** `AttributeError: module 'typing' has no attribute 'TypeAlias'` when the secure-gmail skill (Composio) runs. That means the Python used to run the skill is older than 3.10.

**Fix:** Use a venv with Python 3.11+ and have OpenClaw use it when running Python skills.

---

## 1. Venv already created

A venv was created at **`workspace/.venv`** using Python 3.13 (`/opt/homebrew/bin/python3.13`). If that path doesn’t exist on your machine, create the venv yourself with a 3.11+ interpreter:

```bash
cd /Users/edgetbot/OpenClaw_Github
/opt/homebrew/bin/python3.13 -m venv workspace/.venv
# or: python3.11 -m venv workspace/.venv   # if you have 3.11
```

---

## 2. Install Composio (run locally)

From the repo root:

```bash
cd /Users/edgetbot/OpenClaw_Github
workspace/.venv/bin/pip install -U pip
workspace/.venv/bin/pip install python-dotenv composio-core
```

(Or activate the venv first: `source workspace/.venv/bin/activate` then `pip install python-dotenv composio-core`.)

---

## 3. Start the gateway with the venv active

So that when OpenClaw runs the secure-gmail skill it uses the venv’s Python:

```bash
cd /Users/edgetbot/OpenClaw_Github
source workspace/.venv/bin/activate
openclaw gateway --port 18789
```

Leave that terminal open. The agent will use `python` from the venv (3.13) for Python skills, so Composio gets `typing.TypeAlias`.

---

## 4. Optional: make it default for this repo

To avoid having to remember to activate, you can start the gateway from a script that activates the venv first, or set `PATH` so `workspace/.venv/bin` is first when you start OpenClaw from this repo.
