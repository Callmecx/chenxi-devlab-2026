# V4 in development — 2026-10-13

Target `Callmecx/chenxi-devlab-2026`, branch `feat/intelligence-v4-flagship`, preserved V3 base/tag `4d2a85f2908cc5b202bc104707ec9a00947af47c`. Nothing published for V4 yet.

- G0 rerun from clean V3: typecheck, lint,308 unit/API, all app builds and95/95 browser checks passed; historical144 reports/screenshots restored byte for byte. Raw records: `.local/v4/baseline`.
- New V4 domain has11 stations/16 routes, three ship roles/six ships, four mission chains, constrained inventory/berths/energy, finite waiting, recorded attempts, same-snapshot comparison and strict replay. Foundation checkpoint `83780a1` passed84 domain checks including49 model-adapter test-double checks; subsequent urgent-task, same-policy, deadline/fairness/cancel boundaries await the final combined run. These are not live-model results.
- Independent review fixed premature low-fuel assignment failure, history-limit running dead end, hidden per-hop cost, conflicting idempotency bodies, and replay tool timings. Actual state and recorded evidence remain authoritative.
- G1—G4 integration: six shared views, three original ship silhouettes, physical cockpit instruments, all four mission chains, five experience cameras, actual guide, model proposal approval, strict replay and Worker comparison now exist. R1—R6 actual1440/390 screenshots led to composition/cockpit/mobile corrections; R6 is a reviewed preview, not a final production certificate. The flagship uses `/intelligence`, the retained V3 and its assertions use `/intelligence/v3`.
- G5 production browser history: first12/21; second24/26; third123/126 (703.003s), zero retries/skips. The complete default guide reached real delivery at96.807s. All10 Worker/fault checks and40 lifecycle rounds (camera/scenario/import/reset) passed. The three remaining failures were fixed and passed in targeted batches2/2 and1/1: mobile hidden desktop-menu measurement, the retained practical-task test navigating to the new V4 entry, and Playwright-owned listener attribution. The probe now requires both exact callback features and a registration stack, retains raw counts, and gives application/unattributed listeners zero growth tolerance. Failure data and targeted results remain under `.local/v4/browser-first` through `browser-fifth`.
- Current full typecheck/Lint, web/mini/App resource builds and publication-candidate security scan passed. The11:58:21 full unit/API run passed398/398, zero skipped/failed,8.74s. The previous397/398 run exposed a test setup that assumed loading atT5; the actual boundary isT6, corrected withT7 expiry assertions. No failed assertion was removed. Final browser run, performance, six production frames/video and release remain pending.
- Final specification review found an over-broad damage-injection command: only relay facilities have a supported physical repair chain. Runtime/UI now explicitly constrain physical damage, while permission closures remain available everywhere. Shared resource/lane layers and actual berth/transit reservation explanations are complete. The12:35:25 full unit/API run passed399/399,24files,0skipped/failed/todo,4.15s; full typecheck and Lint also passed after the final UI/test edits. A new browser test checks real repairs, nonzero occupancy, layer pixels and unchanged world facts; the existing10-round camera lifecycle now toggles the lazy resource layer. Their production runs remain next.
- The clean `8b489bc` production follow-up passed2/2: actual repair/permission/occupancy/layer inspection and10 camera rounds with resource-layer toggles. A101.360-second original WebM reached T67/W4 and two completed missions; its exported JSON was accepted by the actual strict import UI. These facts do not grant visual acceptance: S3/S4/S5 revealed occluded work ships, and resource labels overlapped. R7/R8 candidate captures prompted geometry-aware berth staging, obstruction-aware close cameras and screen-space label separation. R7's empty desktop loading shot remains a failed visual sample; R8 shows the working ship at both widths. Final source-level visual review and production recapture remain necessary.
- Historical screenshot provenance was checked per file against the clean G0 inventory, HEAD blobs, saved third-run hashes and test timestamps. The11 overwritten historical images were restored only after those checks; new regression output now goes to `docs/screenshots/v4/regression/`, and raw candidate/failure evidence remains in `.local/v4/`.
- Next: freeze the reviewed renderer, checkpoint clean source, rerun all127 browser cases, capture six production states/video and measure both V3/V4 on the same host, then normal PR/CI/Pages and anonymous release checks. Earlier candidate media/performance remain separately labelled, never substituted for final-source results.

Core contracts/runtime/root config/Git remain owned by the integration lead; renderer/UI/QA have separate files. No real model calls, new paid services, repository visibility changes or other-project edits.

---
# V3 released and anonymously verified — 2026-10-13

Only target: `Callmecx/chenxi-devlab-2026`. Development branch: `feature/intelligence-lab-v3-rebuild`; [PR #2](https://github.com/Callmecx/chenxi-devlab-2026/pull/2) merged into main. Functional release: `da9b6337be81f7d6650785071984d1d2eb73fb47`. [Main CI and Pages](https://github.com/Callmecx/chenxi-devlab-2026/actions/runs/38286209858) succeeded at 2026/10/13 01:58:05 +08; [anonymous browser verification](docs/testing/online-smoke.json) at 2026/10/13 02:02:26 +08 checked that exact deployed revision.

- Original layered orbital port, direct-start delivery, two coordinated carriers, responsive dock, object picking and five camera modes are implemented at /intelligence. The old practical tools remain at /intelligence/tasks. Main/shop/pulse paths remain intact.
- Weighted graph search, stock reservations, energy/capacity checks, route intervention, bounded failures, Worker branch isolation, strict history and late-result guards determine real local-simulation outcomes.
- Typecheck/Lint and308 unit/API tests pass. Final local production browser batch: **95/95**, original64 + flagship28 + Worker3, zero failures/skips/retries, 296.929 seconds. The complete main CI also passed before deployment, including all web and WeChat/App resource builds.
- Actual anonymous public check:9 routes at390/1440,4 business flows and4 evidence assets, zero page errors or missing assets; deployed build revision and clean source metadata match the release. ORBIT is tested through unreachable and explicit same-run recovery to3 delivered.
- V2 baseline and V3 visual iterations, original75.720-second browser recording, dynamic performance samples, three-minute script, five source questions and resume wording are in docs/intelligence-lab-v3. [Release and recording](https://github.com/Callmecx/chenxi-devlab-2026/releases/tag/v3.0.0); GitHub size/digest match the reviewed original.
- Static reduced-motion worlds now render on demand. Actual old regression showed15→47 draws in500ms; the fix preserves camera/world updates, normal/running continuous rendering, adaptive fallback and resource cleanup.

Failure history is retained: first PR CI38278671655 was92/93; splitting the two camera journeys yielded a real94/94 PR CI38281209887. The slower first main CI38282884515 then failed92/94; saved PNGs proved it switched to2D during camera capture. The on-demand renderer fix and a new regression resolved the idle redraw cause without weakening pixel thresholds, state assertions, timeouts or fallback.

Rollback remains `v2.0.0` / `8059fb954e089a7880a4d1cea52941f03deb5c54`, using a reviewed revert and CI/Pages. This is a dated functional publication record; delivery-only follow-ups retain its evidence, and the latest deployed revision is independently inspectable through build-meta and Actions.

Local deterministic simulation and validated replay are enabled. No live model, public API backend, physical robot, real-phone GPU or signed/store app claim. Original procedural geometry retains some hard edges and small auxiliary labels; user aesthetic acceptance is not assumed. V2 home mobile Lighthouse89 and upstream uni-app advisories remain disclosed. Old private portfolio, other repositories and withdrawn C-drive cleanup remain untouched.

---

# V2 status (preserved release record)

Target: `Callmecx/chenxi-devlab-2026` · branch `feat/chenxi-v2` · baseline `b62db8d`.

## Released and anonymously verified — 2026-10-12 22:15 +08

V2 source release: `e946a67b00dd103ead319b68af64300f35f14228`, [PR #1](https://github.com/Callmecx/chenxi-devlab-2026/pull/1). [Main CI and Pages](https://github.com/Callmecx/chenxi-devlab-2026/actions/runs/38260520649) succeeded at 22:14 +08. [V2 anonymous smoke](https://github.com/Callmecx/chenxi-devlab-2026/blob/v2.0.0/docs/testing/online-smoke.json) verifies the exact deployed revision, all eight routes at 390/1440, three public business paths and four evidence assets. See [deployment record](DEPLOYMENT_REPORT.md) for dated evidence; later documentation commits do not imply new functional claims.

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
