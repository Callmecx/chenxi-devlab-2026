# V2 status

Target: `Callmecx/chenxi-devlab-2026` · branch `feat/chenxi-v2` · baseline `b62db8d`.

## Accepted local release candidate — 2026-10-12

- Intelligence tools, warehouse A\*, interventions, approval/cancel/failure/retry and recorded replay implemented.
- Persistent Fastify/SQLite API and both clients; unknown-response and lost-identity recovery verified.
- Market replay, enterprise simulation, three experiments and engineering articles implemented.
- Typecheck/Lint passed; 247/247 unit/API tests; latest production Chrome 64/64, zero retries/skips.
- Three static app builds, WeChat resources and App resources passed.
- 450 deterministic evaluation scenarios meet their expected outcomes; 350 real HTTP benchmark requests, zero failures.
- 360/390/768/1440/1920 screenshots and local videos generated. No V2 release yet.
- Final Lighthouse batch: 18/18 measurements; home mobile89/desktop100, enterprise95, Lab default 2D95, H5 93, shop90 (medians). All accessibility100 and CLS0. Home mobile remains below the 90 target; original results retained.
- Six separate opt-in WebGL measurements: local desktop Chrome idle scene, rAF p50 16.7ms/p95 16.8ms. This is not a phone GPU guarantee or a 3D Lighthouse score.
- Mobile defaults to an operational 2D view and loads Three.js only after opt-in. A final six-test visual pass followed the 64-test full run.
- Final repository-base browser smoke passed at 21:56 +08: 8 routes at 390/1440, three public business paths, four evidence assets and build metadata; no page errors or missing assets.
- Final visual evidence was recaptured after fixing an old-heading/route-transition screenshot race: 6/6 checks passed in 19.2 seconds; enterprise/writing desktop and Lab mobile screenshots manually inspected.
- Feature/source/test/demo/resume matrix and A/B replacement project sections written. Original editable resumes were not found, so no employment timeline changed.

## Next

1. Publish the reviewed candidate branch for CI.
2. Merge only after CI passes; publish Pages and verify anonymous business flows and deployed sourceRevision.
3. Record actual remote commit/run and final online evidence. Public API/model/device conditions remain explicitly unclaimed.

Raw traces, API data and credentials remain in ignored .local. Public CI artifacts include only sanitized summaries and screenshots.
No public API hosting, live model, real WeChat AppID, physical device, signed APK/IPA or store release is claimed.
The old private portfolio and unrelated projects remain untouched. The withdrawn C-drive cleanup request was not executed.
