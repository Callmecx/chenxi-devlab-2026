import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { assertDominionInvariants } from '../../packages/intelligence/src/dominion/invariants';
import { validateRecording } from '../../packages/intelligence/src/dominion/recording';
import type { DominionRecording } from '../../packages/intelligence/src/dominion/types';

const route = process.env.DOMINION_E2E_ROUTE ?? '/#/intelligence';
const lab = (page: Page) => page.getByTestId('dominion-lab');
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const drawer = (page: Page) => page.getByRole('dialog', { name: '世界对象' });

test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });

async function closeDrawer(page: Page) {
  if (await button(page, '关闭面板').isVisible()) await button(page, '关闭面板').click();
}

async function record(page: Page): Promise<DominionRecording> {
  await closeDrawer(page);
  await button(page, '工程档案').click();
  const pending = page.waitForEvent('download');
  await button(page, '导出 JSON').click();
  const path = await (await pending).path();
  expect(path).not.toBeNull();
  return JSON.parse(await readFile(path!, 'utf8')) as DominionRecording;
}

async function selectLane(page: Page, id: string) {
  await closeDrawer(page);
  await button(page, '查看世界对象').click();
  const list = drawer(page).locator('.dom-object-list');
  if (!(await list.isVisible())) await drawer(page).getByText('选择站点、舰船与航道', { exact: true }).click();
  await list.locator(`[data-lane-id="${id}"]`).click();
  await expect(drawer(page)).toBeVisible();
}

async function selectStation(page: Page, id: string) {
  await closeDrawer(page);
  await button(page, '查看世界对象').click();
  const list = drawer(page).locator('.dom-object-list');
  if (!(await list.isVisible())) await drawer(page).getByText('选择站点、舰船与航道', { exact: true }).click();
  await list.locator(`[data-station-id="${id}"]`).click();
}

async function showMap(page: Page) {
  await closeDrawer(page);
  await page.getByRole('navigation', { name: '工作视图' }).getByRole('button', { name: '全息星图', exact: true }).click();
  await expect(page.getByTestId('dominion-map')).toBeVisible();
}

async function layer(page: Page, name: '资源图层' | '航道图层', key: 'resources' | 'lanes', enabled: boolean) {
  const toggle = button(page, name);
  if (await toggle.getAttribute('aria-pressed') !== String(enabled)) await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', String(enabled));
  await expect(lab(page)).toHaveAttribute(`data-layer-${key}`, String(enabled));
  await expect(page.getByTestId('dominion-map')).toHaveAttribute(`data-layer-${key}`, String(enabled));
}

test('DOMINION 真实航道维修保持用户禁行，图层与占用检查不改写暂停世界', async ({ page }) => {
  test.setTimeout(65000);
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(route);
  await expect(lab(page)).toHaveAttribute('data-status', 'ready');
  await button(page, '世界设置').click();
  await page.getByLabel('世界场景', { exact: true }).selectOption('expedition');
  await button(page, '重置并应用场景').click();
  const initial = await record(page);

  await selectLane(page, 'port-forge');
  await expect(drawer(page).getByRole('button', { name: '注入设施损坏', exact: true })).toHaveCount(0);
  await expect(drawer(page)).toContainText('物理损坏演示限于有维修任务的中继关联设施');
  await expect(button(page, '关闭这条航道')).toBeEnabled();
  expect(await record(page)).toEqual(initial);

  await selectLane(page, 'forge-relay');
  await expect(button(page, '注入设施损坏')).toBeEnabled();
  await button(page, '注入设施损坏').click();
  await expect(drawer(page)).toContainText('受损，需维修');
  await expect(button(page, '注入设施损坏')).toBeDisabled();
  await button(page, '关闭这条航道').click();
  await expect(drawer(page)).toContainText('用户禁行');
  await closeDrawer(page);
  await button(page, '单步').click();
  await expect(lab(page)).toHaveAttribute('data-status', 'paused');
  await expect(lab(page)).toHaveAttribute('data-tick', '1');
  const paused = await record(page);
  expect(paused.final.lanes.find(lane => lane.id === 'forge-relay')).toMatchObject({ open: false, damaged: true });
  expect(paused.commands.filter(entry => entry.command.type === 'damage-lane').map(entry => entry.command)).toEqual([{ type: 'damage-lane', laneId: 'forge-relay' }]);

  // Compare occupancy against a user-exported real running-world snapshot.
  // The selected station and lane must actually have incoming/moving ships;
  // an always-zero placeholder panel cannot satisfy these checks.
  const forge = paused.final.stations.find(station => station.id === 'forge')!;
  const docked = paused.final.ships.filter(ship => !ship.transit && ship.nodeId === forge.id);
  const incoming = paused.final.ships.filter(ship => ship.transit?.to === forge.id);
  expect(incoming.length).toBeGreaterThan(0);
  await selectStation(page, forge.id);
  const stationPanel = page.getByTestId('station-commitments');
  await expect(stationPanel).toHaveAttribute('data-docked', String(docked.length));
  await expect(stationPanel).toHaveAttribute('data-inbound', String(incoming.length));
  await expect(stationPanel).toHaveAttribute('data-blocked', String(forge.blockedBerths));
  await expect(stationPanel).toHaveAttribute('data-free', String(Math.max(0, forge.dockCapacity - docked.length - incoming.length - forge.blockedBerths)));
  await expect(stationPanel.locator('[data-commitment="docked"]')).toHaveCount(docked.length);
  await expect(stationPanel.locator('[data-commitment="inbound"]')).toHaveCount(incoming.length);
  for (const ship of docked) await expect(stationPanel.locator(`[data-ship-id="${ship.id}"][data-commitment="docked"]`)).toBeVisible();
  for (const ship of incoming) {
    await expect(stationPanel.locator(`[data-ship-id="${ship.id}"][data-commitment="inbound"]`)).toBeVisible();
    await expect(page.getByTestId('object-related-missions').locator(`[data-mission-id="${ship.missionId}"]`)).toBeVisible();
  }
  expect(await record(page)).toEqual(paused);

  const portForge = paused.final.lanes.find(lane => lane.id === 'port-forge')!;
  const inTransit = paused.final.ships.filter(ship => ship.transit?.laneId === portForge.id);
  const planned = paused.final.ships.filter(ship => ship.route.includes(portForge.id));
  expect(inTransit.length).toBeGreaterThan(0);
  await selectLane(page, portForge.id);
  const lanePanel = page.getByTestId('lane-commitments');
  await expect(lanePanel).toHaveAttribute('data-transit', String(inTransit.length));
  await expect(lanePanel).toHaveAttribute('data-planned', String(planned.length));
  await expect(lanePanel).toHaveAttribute('data-free', String(Math.max(0, portForge.capacity - inTransit.length)));
  await expect(lanePanel.locator('[data-commitment="transit"]')).toHaveCount(inTransit.length);
  for (const ship of inTransit) {
    await expect(lanePanel.locator(`[data-ship-id="${ship.id}"][data-commitment="transit"]`)).toBeVisible();
    await expect(page.getByTestId('object-related-missions').locator(`[data-mission-id="${ship.missionId}"]`)).toBeVisible();
  }
  expect(await record(page)).toEqual(paused);

  await showMap(page);
  await layer(page, '航道图层', 'lanes', true);
  await layer(page, '资源图层', 'resources', false);
  const svg = page.getByTestId('dominion-map').locator('svg.dom-map');
  await expect(page.getByTestId('map-resource-marker')).toHaveCount(0);
  await expect(page.getByTestId('map-lane-layer').locator('.dom-map-route')).toHaveCount(paused.final.lanes.length);
  const withoutResources = await svg.screenshot();
  await layer(page, '资源图层', 'resources', true);
  await expect(page.getByTestId('map-resource-marker')).toHaveCount(paused.final.stations.length);
  const forgeMarker = svg.locator('[data-testid="map-resource-marker"][data-station-id="forge"]');
  await expect(forgeMarker).toBeVisible();
  expect(JSON.parse((await forgeMarker.getAttribute('data-stock'))!)).toEqual(forge.stock);
  expect(JSON.parse((await forgeMarker.getAttribute('data-reserved'))!)).toEqual(forge.reserved);
  // Capture only the real SVG, excluding the highlighted controls. Changing
  // aria-pressed without changing visible world presentation cannot pass.
  expect((await svg.screenshot()).equals(withoutResources), 'resource layer changes the SVG pixels, not only its toggle').toBe(false);
  expect(await record(page)).toEqual(paused);
  await showMap(page);
  await expect(button(page, '资源图层')).toHaveAttribute('aria-pressed', 'true');
  const withLanes = await svg.screenshot();
  await layer(page, '航道图层', 'lanes', false);
  await expect(page.getByTestId('map-lane-layer')).toHaveCount(0);
  await expect(svg.getByRole('button', { name: /^航道 / })).toHaveCount(0);
  await expect(svg.locator('.dom-map-lane').first()).toBeHidden();
  expect((await svg.screenshot()).equals(withLanes), 'lane layer changes the SVG pixels, not only its toggle').toBe(false);
  expect(await record(page)).toEqual(paused);
  await showMap(page);
  await expect(button(page, '航道图层')).toHaveAttribute('aria-pressed', 'false');
  await layer(page, '资源图层', 'resources', false);
  await expect(page.getByTestId('map-resource-marker')).toHaveCount(0);
  await layer(page, '航道图层', 'lanes', true);
  await expect(page.getByTestId('map-lane-layer').locator('.dom-map-route')).toHaveCount(paused.final.lanes.length);
  await expect(svg.locator('.dom-map-lane').first()).toBeVisible();
  expect(await record(page)).toEqual(paused);

  await closeDrawer(page);
  await page.getByRole('combobox', { name: '运行速度', exact: true }).selectOption('4');
  await button(page, '继续远征').click();
  await expect(lab(page)).toHaveAttribute('data-completed', '2', { timeout: 35000 });
  await expect(lab(page)).toHaveAttribute('data-status', 'paused');
  const completed = await record(page);
  expect(completed.final.sessionId).toBe(paused.final.sessionId);
  expect(completed.final.missions.every(mission => mission.status === 'completed')).toBe(true);
  expect(completed.final.ledger.consumed.parts - paused.final.ledger.consumed.parts).toBe(2);
  expect(completed.final.lanes.find(lane => lane.id === 'forge-relay')).toMatchObject({ open: false, damaged: false });
  expect(completed.events.filter(event => event.type === 'relay.repaired')).toHaveLength(1);
  const repaired = completed.events.find(event => event.type === 'relay.repaired')!;
  expect(repaired.payload).toMatchObject({ stationId: 'relay', partsConsumed: 2, permissionRule: 'user-closed lanes stay closed' });
  expect(completed.final.ships.find(ship => ship.id === repaired.payload.shipId)?.role).toBe('repair');
  expect(completed.events.filter(event => event.type === 'ship.departed').map(event => event.payload.laneId)).not.toContain('forge-relay');
  expect(assertDominionInvariants(completed.final)).toEqual([]);
  expect(validateRecording(completed).recording.final).toEqual(completed.final);
  await selectLane(page, 'forge-relay');
  await expect(drawer(page).locator('.dom-entity-facts > div').filter({ has: page.locator('dt', { hasText: '通行权限' }) }).locator('dd')).toHaveText('用户禁行');
  await expect(drawer(page).locator('.dom-entity-facts > div').filter({ has: page.locator('dt', { hasText: '设施状态' }) }).locator('dd')).toHaveText('完好');
  await expect(button(page, '重新开放航道')).toBeEnabled();
  expect(pageErrors).toEqual([]);
});
