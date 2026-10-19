# pi-reconcile checks and release.

# Type check.
check:
    npm run check

# Full test suite (27-check matrix + smoke).
test:
    npm test
    npm run smoke

# Packed-artifact gates: real-pi loader smoke (extension must load via jiti
# and fire session_shutdown cleanly) + tarball contents review.
build:
    pi -p -a -e . 'Reply with exactly: ALIVE'
    npm pack --dry-run

# Full release: gates, then bump+commit+tag (npm version), publish, confirm.
#   just publish 0.2.0
publish VERSION: check test build
    @v=$(node -p 'require("./package.json").version'); \
     if [ "$v" = "{{VERSION}}" ]; then echo "already at {{VERSION}}, resuming"; \
     else npm version {{VERSION}} --message 'chore(release): v%s'; fi
    npm publish --access public
    pi install npm:pi-reconcile
    pi list
