"""Fail closed before exporting the complete application tree to public CI."""
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FORBIDDEN = re.compile(r"(^|/)(\.data|\.env(?:\..*)?|\.evidence|\.ci-receipts|credentials|secrets|uploads|exports|node_modules)(/|$)|\.(db|sqlite3?|pdf|docx|eml|pem|key|png|jpe?g|webp)$", re.I)
SECRETS = re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:ghp_|github_pat_|sk-proj-)[A-Za-z0-9_]{20,}|/(?:Users|home)/[A-Za-z0-9_.-]+/")


def check():
    files = subprocess.check_output(["git", "ls-files", "-z"], cwd=ROOT).decode().split("\0")
    failures = []
    for file in filter(None, files):
        path = ROOT / file
        if file == ".env.example":
            continue
        if FORBIDDEN.search(file) or path.is_symlink():
            failures.append(file)
            continue
        data = path.read_bytes()
        if b"\0" not in data and SECRETS.search(data.decode("utf-8", errors="replace")):
            failures.append(file)
    if failures:
        raise SystemExit("Refusing public export; review source paths: " + ", ".join(failures))
    print("Source policy passed: tracked code and synthetic fixtures only.")


if __name__ == "__main__":
    check()
