# Branch protection for `main`

`main` is protected by a GitHub **ruleset** so that history stays clean and every
change is reviewed through a pull request.

## Rules in effect

| Rule | Effect |
| --- | --- |
| **Require a pull request before merging** | No direct pushes to `main` — changes must land through a PR. |
| **Block force pushes** | `git push --force` to `main` is rejected (no rewriting history). |
| **Restrict deletions** | `main` cannot be deleted. |

**Required approvals:** `0` while this is a solo project. GitHub does not allow you
to approve your own PR, so requiring `1+` approvals with a single maintainer would
block merging. Raise it to `1` once there are other reviewers.

## Everyday workflow

```bash
git checkout -b my-change        # branch off main
# ...edit, commit...
git push -u origin my-change     # push the branch
# open a PR on GitHub, then merge it
```

Force-pushing or committing straight to `main` will be rejected by the ruleset.

## How it was set up

Repo → **Settings** → **Rules** → **Rulesets** → **New ruleset** → **New branch ruleset**

1. Name: `protect-main`
2. Enforcement status: **Active**
3. Target branches: **Include default branch**
4. Enable: **Require a pull request before merging** (required approvals: `0`),
   **Block force pushes**, **Restrict deletions**
5. **Create**

Equivalent API call:

```bash
gh api -X POST repos/ChristopherValleSalazar/salon-website-frontend/rulesets \
  --input - <<'JSON'
{
  "name": "protect-main",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "rules": [
    { "type": "non_fast_forward" },
    { "type": "deletion" },
    { "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": false,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": false
      }
    }
  ]
}
JSON
```

> Need an escape hatch? Add yourself to the ruleset's **Bypass list** — otherwise
> the rules apply to everyone, including repo admins.
