# Chenxi DevLab V2 engineering rules

This checkout belongs only to `Callmecx/chenxi-devlab-2026`.
Keep `/`, `/shop/`, and `/pulse/` under the existing Pages base working.
The separate `Callmecx/chenxi-devlab` repository is read-only reference and must not be edited or published.

- Incremental Vue 3 / Vite development; preserve uni-app portability and both lockfiles.
- The integration owner manages shared contracts, database schema/migrations, root configuration, dependencies, lockfiles, main routing, commits, and release.
- Workers edit only their assigned files. Do not commit, install dependencies, or modify root configuration independently.
- Local simulation, saved replay, and server model execution are distinct modes. No credential means no live model claim.
- Rendering is a projection of domain state. Never use animation completion as business success.
- Test real outcomes: timeouts, late responses, approval rejection, concurrency, authorization, persistence, and unreachable routes. Never remove assertions to obtain a pass.
- Runtime data, caches, logs, recordings and private source notes belong in ignored `.local/`; publish only reviewed evidence.
- Use integer cents and isolated demo sessions. No real payment, personal address collection, trading, camera, or device control.
- Preserve work and history. No reset --hard, force push, repository visibility changes, or edits to unrelated projects.

Checkpoint commands and current gaps are tracked in `STATUS.md`. Every completed checkpoint records real commands/results rather than future promises.
