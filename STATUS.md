# V3 validated local checkpoint — 2026-10-13

Only target: `Callmecx/chenxi-devlab-2026`; branch `feature/intelligence-lab-v3-rebuild`; released rollback baseline `v2.0.0` / `8059fb9`.

- Replaced the flagship `/intelligence` experience with ORBIT: a layered orbital port, two carriers, direct-start mission, responsive bottom dock, object inspection, five camera modes and operational SVG fallback.
- Implemented weighted graph search, inventory/capacity/energy guards, reservations, route closure/replanning, bounded unreachable/wait/history limits, isolated same-snapshot Worker comparison and strictly validated replay.
- Retained practical product/activity/warehouse workflows at `/intelligence/tasks`; migrated their existing browser assertions without removing outcomes. Main, shop, pulse and other works remain in place.
- Actual checks so far: 308/308 unit/API tests; full typecheck and lint; all three static applications, WeChat resources and App resources built. No device/store release is claimed.
- V2 baseline and V3 round-1/round-2 real Chrome screenshots retained. Independent review identified and drove fixes for phone cropping, wide-screen heading wrapping, touch targets, material/lighting, camera reacquisition and stale file import.
- Final production whole-site batch on `dc336f1`: **93/93 passed**, zero failures/skips/retries. All 26 flagship checks, 3 new Worker construction/postMessage/stale-error regressions and the original 64 whole-site checks passed in one run. Original failed runs remain in local evidence.
- Actual 75.720-second recording includes route closure/detour, explicit UNREACHABLE, same-run recovery, isolated strategy comparison and read-only replay. Public sanitized video manifest and SHA-256 accompany the reviewed Release candidate.
- Six active 10-second performance samples: desktop render P50/P95 16.7/16.8ms; desktop Chrome phone viewport 33.3/33.5ms. No real-phone GPU claim. Final printable facts and white background were recaptured.

Repository-base smoke passed at 00:35 +08: 9 routes at 390/1440, 4 business flows, 4 evidence assets, zero page errors/missing assets; clean source `dc336f1` matches build metadata. Next: authorized feature PR and full GitHub CI, main publication, anonymous deployed-revision verification, reviewed video Release attachment. Online remains V2 until actual Pages success is recorded. Resume from this branch, preserving the existing V2 tag and the original three public paths.

See `docs/intelligence-lab-v3/` for the baseline, rules, runtime boundary, visual review and demo guide. Old private portfolio, other repositories and withdrawn C-drive cleanup remain untouched.

---

# V2 status (preserved release record)

Target: `Callmecx/chenxi-devlab-2026` · branch `feat/chenxi-v2` · baseline `b62db8d`.

## Released and anonymously verified — 2026-10-12 22:15 +08

V2 source release: `e946a67b00dd103ead319b68af64300f35f14228`, [PR #1](https://github.com/Callmecx/chenxi-devlab-2026/pull/1). [Main CI and Pages](https://github.com/Callmecx/chenxi-devlab-2026/actions/runs/38260520649) succeeded at 22:14 +08. [Anonymous smoke](docs/testing/online-smoke.json) verifies the exact deployed revision, all eight routes at 390/1440, three public business paths and four evidence assets. See [deployment record](DEPLOYMENT_REPORT.md) for dated evidence; later documentation commits do not imply new functional claims.

- Intelligence tools, warehouse A\*, interventions, approval/cancel/failure/retry and recorded replay implemented.
- Persistent Fastify/SQLite API and both clients; unknown-response and lost-identity recovery verified.
- Market replay, enterprise simulation, three experiments and engineering articles implemented.
- Typecheck/Lint passed; 247/247 unit/API tests; latest production Chrome 64/64, zero retries/skips.
- Three static app builds, WeChat resources and App resources passed.
- 450 deterministic evaluation scenarios meet their expected outcomes; 350 real HTTP benchmark requests, zero failures.
- 360/390/768/1440/1920 screenshots and 64 local videos generated; original three public entries remain available.
- Final Lighthouse batch: 18/18 measurements; home mobile89/desktop100, enterprise95, Lab default 2D95, H5 93, shop90 (medians). All accessibility100 and CLS0. Home mobile remains below the 90 target; original results retained.
- Six separate opt-in WebGL measurements: local desktop Chrome idle scene, rAF p50 16.7ms/p95 16.8ms. This is not a phone GPU guarantee or a 3D Lighthouse score.
- Mobile defaults to an operational 2D view and loads Three.js only after opt-in. A final six-test visual pass followed the 64-test full run.
- Final repository-base browser smoke passed at 21:56 +08: 8 routes at 390/1440, three public business paths, four evidence assets and build metadata; no page errors or missing assets.
- Final visual evidence was recaptured after fixing an old-heading/route-transition screenshot race: 6/6 checks passed in 19.2 seconds; enterprise/writing desktop and Lab mobile screenshots manually inspected.
- Feature/source/test/demo/resume matrix and A/B replacement project sections written. Original editable resumes were not found, so no employment timeline changed.

## Remaining boundaries and continuation

1. Mobile home Lighthouse median89 is below the90 goal; retain this baseline for a focused future optimization.
2. Public API deployment requires an approved persistent HTTPS host; local SQLite service and explicit public local modes are delivered. No hosting or model purchase was made.
3. Real model, WeChat AppID/DevTools/device, Android/iOS device/signing/store remain unverified. Actual development resource archives and hashes are listed in [resource artifacts](docs/acceptance/RESOURCE_ARTIFACTS.md).
4. The uni-app build-tool dependency advisory remains disclosed; do not force incompatible framework upgrades or claim all dependency audits are clean.

The ten-minute walkthrough and both verified resume project sections are in docs/interview. No original editable resumes were provided; replacement project entries are delivered without inventing employment dates.

Raw traces, API data and credentials remain in ignored .local. Public CI artifacts include only sanitized summaries and screenshots.
No public API hosting, live model, real WeChat AppID, physical device, signed APK/IPA or store release is claimed.
The old private portfolio and unrelated projects remain untouched. The withdrawn C-drive cleanup request was not executed.
