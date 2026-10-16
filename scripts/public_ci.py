"""Public exact-SHA verification, with local authenticated status recording.

No private token is stored in the public repository or its Actions secrets.
"""
import argparse
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CANONICAL = "StevenRidder/sv-itineris"
PUBLIC = "StevenRidder/sv-itineris-ci"
CONTEXT = "sv-itineris-ci/gate"


def run(*args):
    return subprocess.check_output(args, cwd=ROOT, text=True).strip()


def validate_run(result, sha):
    if result.get("status") != "completed" or result.get("conclusion") != "success":
        raise ValueError("Public run did not complete successfully")
    if result.get("head_sha") != sha or result.get("event") != "workflow_dispatch":
        raise ValueError("Run does not verify this exact source SHA")
    if result.get("name") != "Verify exact SV Itineris SHA" or result.get("path") != ".github/workflows/verify.yml":
        raise ValueError("Unexpected verification workflow")
    if result.get("repository", {}).get("full_name") != PUBLIC:
        raise ValueError("Unexpected verification repository")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["push", "prove"])
    parser.add_argument("run_id", nargs="?")
    args = parser.parse_args()
    sha = run("git", "rev-parse", "HEAD")
    if args.command == "push":
        if run("git", "status", "--porcelain", "--untracked-files=normal"):
            raise SystemExit("Commit the complete reviewed source before exporting")
        run("python3", "scripts/source_policy.py")
        # Export the exact commit, not a reconstructed snapshot or private runtime folder.
        run("git", "push", "ci", f"{sha}:refs/heads/ci/{sha}")
        run("gh", "api", "-X", "POST", f"repos/{CANONICAL}/statuses/{sha}", "-f", "state=pending", "-f", f"context={CONTEXT}", "-f", "description=Waiting for exact-SHA public verification")
        run("gh", "workflow", "run", "verify.yml", "--repo", PUBLIC, "--ref", f"ci/{sha}")
        print(json.dumps({"sha": sha, "repository": PUBLIC, "branch": f"ci/{sha}", "status": "pending"}))
    else:
        if not args.run_id or not args.run_id.isdigit():
            raise SystemExit("Pass the completed public run ID")
        result = json.loads(run("gh", "api", f"repos/{PUBLIC}/actions/runs/{args.run_id}"))
        validate_run(result, sha)
        jobs = json.loads(run("gh", "api", f"repos/{PUBLIC}/actions/runs/{args.run_id}/jobs"))["jobs"]
        if not jobs or any(j.get("conclusion") != "success" for j in jobs):
            raise SystemExit("A required verification job did not succeed")
        remote_tree = json.loads(run("gh", "api", f"repos/{PUBLIC}/git/commits/{sha}"))["tree"]["sha"]
        if remote_tree != run("git", "rev-parse", "HEAD^{tree}"):
            raise SystemExit("Public source tree differs")
        run("gh", "api", "-X", "POST", f"repos/{CANONICAL}/statuses/{sha}", "-f", "state=success", "-f", f"context={CONTEXT}", "-f", f"target_url={result['html_url']}", "-f", "description=Exact source SHA passed public build and tests")
        print(json.dumps({"sha": sha, "public_run": result["html_url"], "canonical_status": "success"}))


if __name__ == "__main__":
    main()
