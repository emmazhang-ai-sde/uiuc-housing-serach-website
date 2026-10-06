"""
scripts/resend_pending_reminder.py

Send a plain "come try it out" reminder email, via the Resend API directly,
to everyone in a pending-emails file (one email per line — the output of
`scripts/list_email_segments.py --out ...`, e.g. pending.txt).

Why not scripts/bulk_invite.py: that script calls Supabase's POST /auth/v1/invite,
which only works for emails with no auth.users row yet — it 500s on anyone
already invited/registered. "Pending" mixes both never-registered and
registered-but-never-logged-in emails, and this project's login page
(components/auth/LoginCard.tsx) already handles both cases identically —
signInWithOtp with shouldCreateUser: true creates the account transparently
on first code entry if it doesn't exist yet, or just logs the person in if it
does — as long as the email passes the is_email_on_waitlist check. So one
plain reminder email pointing at /login works for the whole pending segment;
no Supabase Auth call is needed here at all, this hits Resend's API directly.

Requires RESEND_API_KEY in .env or frontend/.env.local (Resend dashboard →
API Keys → a Sending key, re_...). Never commit it, never log it.

Safety:
- Defaults to --dry-run: prints who would receive the email, sends nothing.
- --test sends only to TEST_EMAILS, ignoring the input file, for a live check.
- --limit caps how many real sends happen in one run (Resend free tier is
  100/day, 3,000/month per design-docs/user-authentication.md §5.7.1).
- Skips blank lines / obviously malformed rows in the input file.

Usage:
    source .venv/bin/activate
    python scripts/resend_pending_reminder.py --dry-run                     # see who'd get it, sends nothing
    python scripts/resend_pending_reminder.py --test                        # live test on TEST_EMAILS only
    python scripts/resend_pending_reminder.py --email someone@illinois.edu  # send to one specific address
    python scripts/resend_pending_reminder.py --limit 100                   # real run, capped at 100 sends
"""

import argparse
import os
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv()
load_dotenv(Path(__file__).resolve().parent.parent / "frontend" / ".env.local")

RESEND_API_KEY = os.environ.get("RESEND_API_KEY")
FROM_ADDRESS = os.environ.get("RESEND_FROM_ADDRESS", "UIUC Housing AI <hello@illinirent.com>")
SITE_URL = os.environ.get("NEXT_PUBLIC_SITE_URL", "https://illinirent.com").rstrip("/")
LOGIN_URL = f"{SITE_URL}/login"

DEFAULT_INPUT = Path(__file__).resolve().parent / "mail-merge-batches" / "pending.txt"
DELAY_BETWEEN_SENDS = 0.6  # seconds — Resend's free tier rate limit is 2 req/sec

TEST_EMAILS = [
    "shuyangzhang.cs@gmail.com",
    "shuyangzhang.life@gmail.com",
    "sz94@illinois.edu",
]

SUBJECT = "68+ UIUC students are already using Housing AI Project"

HTML_BODY = f"""\
<!DOCTYPE html>
<html lang="en">
  <body
    style="
      margin: 0;
      padding: 0;
      background: #fff7ed;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
        Helvetica, Arial, sans-serif;
      color: #1f2937;
    "
  >
    <table
      role="presentation"
      width="100%"
      cellpadding="0"
      cellspacing="0"
      style="padding: 32px 16px;"
    >
      <tr>
        <td align="center">
          <table
            role="presentation"
            width="100%"
            cellpadding="0"
            cellspacing="0"
            style="
              max-width: 560px;
              background: #ffffff;
              border-radius: 20px;
              overflow: hidden;
            "
          >
            <tr>
              <td
                style="
                  padding: 34px 40px 26px;
                  background: #ffffff;
                  text-align: center;
                "
              >
                <p
                  style="
                    margin: 0 0 10px;
                    font-size: 13px;
                    line-height: 1.4;
                    font-weight: 800;
                    letter-spacing: 0.08em;
                    text-transform: uppercase;
                    color: #ff5f05;
                  "
                >
                  Quick Update
                </p>

                <p
                  style="
                    margin: 0;
                    font-size: 24px;
                    line-height: 1.35;
                    font-weight: 800;
                    color: #111827;
                  "
                >
                  68+ UIUC students are already using Housing AI Project
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding: 34px 40px 24px;">
                <p
                  style="
                    margin: 0 0 18px;
                    font-size: 16px;
                    line-height: 1.7;
                    color: #374151;
                  "
                >
                  Hi,
                </p>

                <p
                  style="
                    margin: 0 0 18px;
                    font-size: 16px;
                    line-height: 1.7;
                    color: #374151;
                  "
                >
                  Since we launched, over 68 students have signed up and started
                  using the site, and the feedback has been really positive so
                  far.
                </p>

                <p
                  style="
                    margin: 0 0 18px;
                    font-size: 16px;
                    line-height: 1.7;
                    color: #374151;
                  "
                >
                  We&apos;ve pulled together listings from
                  <span style="font-weight: 700; color: #ff5f05;">
                    Green Street Realty, University Group, Smile, MHM, Seven07,
                    Bankier, Roland Realty, and JSJ Property Management
                  </span>,
                  all in one place.
                </p>

                <p
                  style="
                    margin: 0 0 24px;
                    font-size: 16px;
                    line-height: 1.7;
                    color: #374151;
                  "
                >
                  <span style="font-weight: 700; color: #ea580c;">
                    No more opening eight different tabs and comparing manually.
                  </span>
                  Just search once and see everything side by side, whether you
                  prefer chatting with our AI assistant or browsing the
                  map/filter view.
                </p>

                <table
                  role="presentation"
                  cellpadding="0"
                  cellspacing="0"
                  style="margin: 0 auto 28px;"
                >
                  <tr>
                    <td
                      style="
                        background: #ff5f05;
                        border-radius: 999px;
                      "
                    >
                      <a
                        href="{LOGIN_URL}"
                        style="
                          display: inline-block;
                          padding: 12px 24px;
                          font-size: 15px;
                          line-height: 1.4;
                          font-weight: 700;
                          color: #ffffff;
                          text-decoration: none;
                        "
                      >
                        Try it out
                      </a>
                    </td>
                  </tr>
                </table>

                <p
                  style="
                    margin: 0 0 22px;
                    font-size: 16px;
                    line-height: 1.7;
                    color: #374151;
                  "
                >
                  Would love to hear what you think. Feel free to reply to this
                  email or leave feedback once you&apos;ve explored it.
                </p>

                <p
                  style="
                    margin: 0 0 18px;
                    font-size: 14px;
                    line-height: 1.7;
                    color: #6b7280;
                  "
                >
                  Housing AI Project is an independent student-built project and
                  is not affiliated with or endorsed by the University of
                  Illinois.
                </p>

                <p
                  style="
                    margin: 0;
                    font-size: 16px;
                    line-height: 1.7;
                    font-weight: 700;
                    color: #13294b;
                  "
                >
                  Housing AI Project
                </p>
              </td>
            </tr>

            <tr>
              <td
                style="
                  padding: 0 40px 32px;
                  text-align: center;
                  background: #ffffff;
                "
              >
                <p
                  style="
                    margin: 0;
                    font-size: 12px;
                    line-height: 1.6;
                    color: #9ca3af;
                    font-style: italic;
                  "
                >
                  You are receiving this email because you joined the project
                  waitlist.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
"""

TEXT_BODY = f"""\
Hi,

Since we launched, over 68 students have signed up and started using the site, and the feedback has been really positive so far.

We've pulled together listings from Green Street Realty, University Group, Smile, MHM, Seven07, Bankier, Roland Realty, and JSJ Property Management, all in one place.

No more opening eight different tabs and comparing manually. Just search once and see everything side by side, whether you prefer chatting with our AI assistant or browsing the map/filter view.

Try it out: {LOGIN_URL}

Would love to hear what you think. Feel free to reply to this email or leave feedback once you've explored it.

Housing AI Project is an independent student-built project and is not affiliated with or endorsed by the University of Illinois.

Housing AI Project

You are receiving this email because you joined the project waitlist.
"""


def _headers() -> dict:
    if not RESEND_API_KEY:
        raise SystemExit(
            "Missing RESEND_API_KEY in .env or frontend/.env.local. "
            "Get it from Resend Dashboard → API Keys → a Sending key (re_...). "
            "Do not commit it."
        )
    return {
        "Authorization": f"Bearer {RESEND_API_KEY}",
        "Content-Type": "application/json",
    }


def load_emails(path: Path) -> list[str]:
    if not path.exists():
        raise SystemExit(
            f"Input file not found: {path}\n"
            "Generate it first with: python scripts/list_email_segments.py --out scripts/mail-merge-batches"
        )
    emails = []
    for line in path.read_text().splitlines():
        e = line.strip().lower()
        if e and "@" in e:
            emails.append(e)
    return emails


def send_reminder(email: str) -> tuple[bool, str]:
    res = requests.post(
        "https://api.resend.com/emails",
        json={
            "from": FROM_ADDRESS,
            "to": [email],
            "subject": SUBJECT,
            "html": HTML_BODY,
            "text": TEXT_BODY,
        },
        headers=_headers(),
        timeout=30,
    )
    if res.ok:
        return True, "sent"
    return False, f"{res.status_code} {res.text[:200]}"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="List recipients, send nothing")
    parser.add_argument("--test", action="store_true", help="Send only to TEST_EMAILS (live)")
    parser.add_argument("--email", help="Send to this one address only (live), ignoring the input file")
    parser.add_argument("--input", default=str(DEFAULT_INPUT), help=f"Path to the pending-emails file (default: {DEFAULT_INPUT})")
    parser.add_argument("--limit", type=int, default=100, help="Max real sends this run")
    args = parser.parse_args()

    if args.email:
        targets = [args.email.strip().lower()]
    elif args.test:
        targets = TEST_EMAILS
    else:
        targets = load_emails(Path(args.input))
        print(f"Loaded {len(targets)} email(s) from {args.input}")

    if args.dry_run:
        print("\n--dry-run: sending nothing. Would email:")
        for e in targets:
            print(f"  {e}")
        return

    targets = targets[: args.limit]
    print(f"\nSending {len(targets)} reminder(s)...")

    sent, failed = 0, []
    for i, email in enumerate(targets, 1):
        ok, detail = send_reminder(email)
        status = "OK" if ok else "FAIL"
        print(f"[{i}/{len(targets)}] {email} -> {status} ({detail})")
        if ok:
            sent += 1
        else:
            failed.append((email, detail))
        time.sleep(DELAY_BETWEEN_SENDS)

    print(f"\nDone. Sent {sent}/{len(targets)}.")
    if failed:
        print(f"Failed ({len(failed)}):")
        for email, detail in failed:
            print(f"  {email}: {detail}")


if __name__ == "__main__":
    main()
