#!/bin/bash
# Setup script for pre-commit hooks
# Run once after cloning: ./setup-hooks.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Setting up git hooks for ultimate-arr-stack..."
echo ""

# Check we're in a git repo — and ask git rather than looking for a .git
# DIRECTORY. Inside a worktree, .git is a FILE holding a gitdir pointer, so
# `[[ -d .git ]]` is false and this script would exit 1 claiming "not a git
# repository". The hook then silently never gets installed, and every check it
# performs stops running for that worktree.
if ! GIT_COMMON_DIR="$(git -C "$SCRIPT_DIR" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)"; then
    echo "ERROR: Not a git repository. Run this from the repo root."
    exit 1
fi

# Hooks live in the COMMON git dir, shared by every worktree of this repo.
HOOKS_DIR="$GIT_COMMON_DIR/hooks"

# Create hooks directory if needed
mkdir -p "$HOOKS_DIR"

# Remove existing hook if present
if [[ -e "$HOOKS_DIR/pre-commit" ]]; then
    rm "$HOOKS_DIR/pre-commit"
    echo "  Removed existing pre-commit hook"
fi

# Absolute path, not the old "../../scripts/pre-commit": that relative link
# assumed HOOKS_DIR was always <repo>/.git/hooks, which is untrue for worktrees.
ln -s "$SCRIPT_DIR/scripts/pre-commit" "$HOOKS_DIR/pre-commit"
echo "  Created symlink: $HOOKS_DIR/pre-commit -> $SCRIPT_DIR/scripts/pre-commit"

# Ensure scripts are executable
chmod +x "$SCRIPT_DIR/scripts/pre-commit"
chmod +x "$SCRIPT_DIR/scripts/lib/"*.sh
echo "  Made scripts executable"

echo ""
echo "Done! Pre-commit hook installed."
echo ""
echo "The hook will run automatically on 'git commit'."
echo "To test manually: ./scripts/pre-commit"
echo ""
echo "To uninstall: rm \"$HOOKS_DIR/pre-commit\""
