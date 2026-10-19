#!/bin/sh
# Vercel install step. Kept out of vercel.json because installCommand is
# capped at 256 chars.
#
# npx prisma generate is what has always worked on Vercel. It broke when npx
# resolved "prisma" to the newest publish (a Prisma 8 RC that dropped the
# "generate" command), so the version is pinned to match @prisma/client.
#
# We cannot use the locally installed CLI: Vercel's npm runs with a scripts
# allowlist, which suppresses bin links, so node_modules/.bin/prisma never
# exists there.
set -e

npm install

npx --yes prisma@5.22.0 generate --schema=backend/prisma/schema.prisma && exit 0

echo '--- PRISMA GENERATE FAILED: diagnostics ---'
echo 'node_modules/prisma:';        ls -d node_modules/prisma 2>&1 || true
echo 'node_modules/@prisma:';       ls -d node_modules/@prisma 2>&1 || true
echo 'node_modules/@prisma/client:'; ls -d node_modules/@prisma/client 2>&1 || true
echo 'node_modules/.bin:';          ls node_modules/.bin 2>&1 | head -40 || true
echo 'ignore-scripts:';             npm config get ignore-scripts || true
echo 'NODE_ENV:';                   echo "${NODE_ENV:-unset}"
exit 1
