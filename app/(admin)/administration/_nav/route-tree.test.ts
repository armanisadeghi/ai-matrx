jest.mock('../config', () => ({ MODULE_HOME: '/administration', MODULE_NAME: 'Administration', filteredPages: [] }));
import { buildAdminTree, getAdminCrumbs } from './route-tree';

it('keeps parameter templates out of admin breadcrumb destinations', () => {
  const tree = buildAdminTree(['mandates', 'mandates/[mandateKey]', 'mandates/new', 'files/[...path]', 'docs/[[...slug]]']);
  const crumbs = getAdminCrumbs(tree, '/administration/mandates/research_client.output_slides');
  expect(crumbs[1].children.map(child => child.fullPath)).toEqual(['/administration/mandates/new']);
  expect(crumbs[2].fullPath).toBe('/administration/mandates/research_client.output_slides');
  expect(JSON.stringify(tree)).not.toContain('[mandateKey]');
});
