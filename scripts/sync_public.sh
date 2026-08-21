#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
#  sync_public.sh — publish the internal line to the public repository as a
#  single squashed commit, with internal-only paths held back.
#
#  Why a squash rather than a plain push: the internal history carries files
#  that must never become public, and deleting them in a later commit does not
#  remove them from history — anyone can `git log` them back. Squashing onto
#  the public tip publishes the current tree only, so an excluded path never
#  enters the public object graph at all.
#
#  Usage:
#      ./scripts/sync_public.sh "release: Minerva vX.Y.Z — summary"
#      ./scripts/sync_public.sh --check          # audit only, push nothing
#
#  Anything added to EXCLUDE below is stripped from the published tree. Add to
#  it before publishing, never after.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

INTERNAL_REMOTE="${INTERNAL_REMOTE:-internal}"
PUBLIC_REMOTE="${PUBLIC_REMOTE:-origin}"
BRANCH="${BRANCH:-main}"

# Paths that stay internal.
EXCLUDE=(
    # 2026-08 deployment security audit. Names the live C2 host, the operator
    # LAN and VPN ranges, and carries file:line evidence for weaknesses that
    # were live at the time. Fixed or not, it is a map of the infrastructure.
    "docs/audit-2026-08"
)

# Strings that must never appear in the published tree. A hit is a hard stop:
# these have leaked through code comments before, not just through documents.
FORBIDDEN='172\.20\.210|192\.168\.220|c2\.redmeow\.tw|BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY'

RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[1;33m'; NC=$'\033[0m'
info() { echo "  $*"; }
ok()   { echo "${GREEN}  ✓ $*${NC}"; }
warn() { echo "${YELLOW}  ! $*${NC}"; }
die()  { echo "${RED}  ✗ $*${NC}" >&2; exit 1; }

cd "$(dirname "${BASH_SOURCE[0]}")/.."

CHECK_ONLY=0
MESSAGE=""
case "${1:-}" in
    --check) CHECK_ONLY=1 ;;
    "")      die "need a commit message (or --check)" ;;
    *)       MESSAGE="$1" ;;
esac

echo "── fetching remotes ──"
git fetch "$PUBLIC_REMOTE" --quiet
git fetch "$INTERNAL_REMOTE" --quiet

LOCAL_HEAD=$(git rev-parse "$BRANCH")
INTERNAL_HEAD=$(git rev-parse "$INTERNAL_REMOTE/$BRANCH")
[ "$LOCAL_HEAD" = "$INTERNAL_HEAD" ] || die "$BRANCH is not in sync with $INTERNAL_REMOTE/$BRANCH — push there first"

echo "── building the published tree ──"
TMP_INDEX="$(mktemp -t minerva-sync-XXXXXX)"
trap 'rm -f "$TMP_INDEX"' EXIT

GIT_INDEX_FILE="$TMP_INDEX" git read-tree "$BRANCH"
before=$(GIT_INDEX_FILE="$TMP_INDEX" git ls-files | wc -l | tr -d ' ')

for path in "${EXCLUDE[@]}"; do
    if GIT_INDEX_FILE="$TMP_INDEX" git ls-files --error-unmatch "$path" >/dev/null 2>&1; then
        GIT_INDEX_FILE="$TMP_INDEX" git rm -r --cached --quiet "$path"
        info "held back: $path"
    fi
done

after=$(GIT_INDEX_FILE="$TMP_INDEX" git ls-files | wc -l | tr -d ' ')
TREE=$(GIT_INDEX_FILE="$TMP_INDEX" git write-tree)
ok "tree $TREE  ($before → $after files)"

echo "── auditing the published tree ──"
for path in "${EXCLUDE[@]}"; do
    git ls-tree -r --name-only "$TREE" | grep -q "^$path" \
        && die "$path is still in the tree" || true
done
ok "every excluded path is absent"

hits=$(git grep -nIiE "$FORBIDDEN" "$TREE" -- ':!package-lock.json' 2>/dev/null || true)
if [ -n "$hits" ]; then
    echo "$hits" | head -20
    die "forbidden strings found in the tree above — fix them before publishing"
fi
ok "no forbidden strings"

if [ "$CHECK_ONLY" = "1" ]; then
    echo
    ok "check only — nothing pushed"
    exit 0
fi

echo "── publishing ──"
PARENT=$(git rev-parse "$PUBLIC_REMOTE/$BRANCH")
COMMIT=$(printf '%s\n' "$MESSAGE" | git commit-tree "$TREE" -p "$PARENT")
info "commit $COMMIT  (parent $(git rev-parse --short "$PARENT"))"

git push "$PUBLIC_REMOTE" "$COMMIT:refs/heads/$BRANCH"
ok "pushed to $PUBLIC_REMOTE/$BRANCH"
echo
info "tag the release when ready:"
info "  git tag -a vX.Y.Z $COMMIT -m 'Minerva vX.Y.Z' && git push $PUBLIC_REMOTE vX.Y.Z"
