#!/usr/bin/env python3
"""gmail-sa helper

Gmail access using a Google service account + domain-wide delegation.

Env vars:
  GOOGLE_CLIENT_EMAIL
  GOOGLE_PRIVATE_KEY
  GOOGLE_IMPERSONATED_USER

Commands:
  list, read, send

Notes:
- Avoid logging secrets.
- GOOGLE_PRIVATE_KEY may contain literal \n; we normalize.
"""

from __future__ import annotations

import argparse
import base64
import os
import sys
from email.message import EmailMessage
from typing import Any, Dict, List, Optional

from google.oauth2 import service_account
from googleapiclient.discovery import build

SCOPES_READONLY = ["https://www.googleapis.com/auth/gmail.readonly"]
SCOPES_SEND = ["https://www.googleapis.com/auth/gmail.send"]
SCOPES_MODIFY = ["https://www.googleapis.com/auth/gmail.modify"]


def _require_env(name: str) -> str:
    v = os.environ.get(name)
    if not v:
        raise SystemExit(f"Missing required env var: {name}")
    return v


def _get_service(scopes: List[str]):
    client_email = _require_env("GOOGLE_CLIENT_EMAIL")
    private_key = _require_env("GOOGLE_PRIVATE_KEY").replace("\\n", "\n")
    subject = _require_env("GOOGLE_IMPERSONATED_USER")

    info = {
        "type": "service_account",
        "client_email": client_email,
        "private_key": private_key,
        # token_uri is required by google-auth for SA creds
        "token_uri": "https://oauth2.googleapis.com/token",
    }

    creds = service_account.Credentials.from_service_account_info(info, scopes=scopes)
    delegated = creds.with_subject(subject)

    # cache_discovery=False avoids writing discovery cache files
    return build("gmail", "v1", credentials=delegated, cache_discovery=False)


def cmd_list(args: argparse.Namespace) -> None:
    scopes = SCOPES_READONLY
    svc = _get_service(scopes)

    user_id = "me"
    q = args.query
    max_results = args.max

    resp = svc.users().messages().list(userId=user_id, q=q, maxResults=max_results).execute()
    msgs = resp.get("messages", [])
    if not msgs:
        print("No messages found.")
        return

    # Fetch lightweight metadata for each message (subject/from/date)
    for m in msgs:
        mid = m.get("id")
        meta = svc.users().messages().get(
            userId=user_id,
            id=mid,
            format="metadata",
            metadataHeaders=["From", "To", "Subject", "Date"],
        ).execute()
        headers = {h["name"].lower(): h.get("value", "") for h in meta.get("payload", {}).get("headers", [])}
        print(f"id={mid}\n  date={headers.get('date','')}\n  from={headers.get('from','')}\n  subject={headers.get('subject','')}\n")


def _extract_text_plain(payload: Dict[str, Any]) -> str:
    """Best-effort extraction of text/plain from a Gmail message payload."""

    def decode_body(body: Dict[str, Any]) -> str:
        data = body.get("data")
        if not data:
            return ""
        try:
            return base64.urlsafe_b64decode(data.encode("utf-8")).decode("utf-8", errors="replace")
        except Exception:
            return ""

    mime_type = payload.get("mimeType", "")
    body = payload.get("body", {})

    if mime_type == "text/plain":
        return decode_body(body)

    # multipart
    parts = payload.get("parts", []) or []
    for p in parts:
        if p.get("mimeType") == "text/plain":
            txt = decode_body(p.get("body", {}))
            if txt:
                return txt

    # recurse
    for p in parts:
        subparts = p.get("parts")
        if subparts:
            txt = _extract_text_plain(p)
            if txt:
                return txt

    return ""


def cmd_read(args: argparse.Namespace) -> None:
    svc = _get_service(SCOPES_READONLY)
    user_id = "me"

    msg = svc.users().messages().get(userId=user_id, id=args.id, format="full").execute()
    headers = {h["name"].lower(): h.get("value", "") for h in msg.get("payload", {}).get("headers", [])}

    print(f"id={args.id}")
    print(f"date={headers.get('date','')}")
    print(f"from={headers.get('from','')}")
    print(f"to={headers.get('to','')}")
    print(f"subject={headers.get('subject','')}")
    print("\n---\n")

    payload = msg.get("payload", {})
    text = _extract_text_plain(payload)
    if not text:
        print("(No text/plain body found; message may be HTML-only or have attachments.)")
    else:
        if args.max_chars and len(text) > args.max_chars:
            text = text[: args.max_chars] + "\n\n[truncated]"
        print(text)


def cmd_send(args: argparse.Namespace) -> None:
    svc = _get_service(SCOPES_SEND)
    user_id = "me"

    em = EmailMessage()
    em["To"] = args.to
    if args.cc:
        em["Cc"] = args.cc
    if args.bcc:
        em["Bcc"] = args.bcc
    em["Subject"] = args.subject
    em.set_content(args.body)

    raw = base64.urlsafe_b64encode(em.as_bytes()).decode("utf-8")
    body = {"raw": raw}

    sent = svc.users().messages().send(userId=user_id, body=body).execute()
    print(f"Sent. id={sent.get('id')}")


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="gmail-sa")
    sub = p.add_subparsers(dest="cmd", required=True)

    p_list = sub.add_parser("list", help="List recent messages")
    p_list.add_argument("--max", type=int, default=10)
    p_list.add_argument("--query", type=str, default=None, help="Gmail search query (q=...)")
    p_list.set_defaults(func=cmd_list)

    p_read = sub.add_parser("read", help="Read a message by id")
    p_read.add_argument("--id", required=True)
    p_read.add_argument("--max-chars", type=int, default=8000)
    p_read.set_defaults(func=cmd_read)

    p_send = sub.add_parser("send", help="Send an email")
    p_send.add_argument("--to", required=True)
    p_send.add_argument("--subject", required=True)
    p_send.add_argument("--body", required=True)
    p_send.add_argument("--cc")
    p_send.add_argument("--bcc")
    p_send.set_defaults(func=cmd_send)

    return p


def main(argv: Optional[List[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    try:
        args.func(args)
        return 0
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
