import { isConcreteRoute, groupRoutes, toModulePages } from './shared';
import { buildRouteSearchRows } from './filter-routes';

const templates = ['mandates/[mandateKey]', 'files/[...path]', 'docs/[[...slug]]', 'orgs/[orgId]/settings'];
const concrete = ['mandates', 'mandates/new', 'mandates/research_client.output_slides'];

describe('filesystem routes used as navigation', () => {
  test.each(templates)('does not navigate to template %s', route => {
    expect(isConcreteRoute(route)).toBe(false);
  });
  test.each(concrete)('preserves concrete destination %s', route => {
    expect(isConcreteRoute(route)).toBe(true);
  });
  it('does not confuse bracketed query values with route parameters', () => {
    expect(isConcreteRoute('/search?filter=[name]')).toBe(true);
  });
  it('excludes templates from every generated module/search/group menu', () => {
    const routes = [...templates, ...concrete];
    expect(toModulePages(routes, '/administration').map(page => page.path)).toEqual(concrete);
    expect(buildRouteSearchRows(routes, '/administration').map(row => row.route)).toEqual(concrete);
    expect(Object.values(groupRoutes(routes)).flat().sort()).toEqual([...concrete].sort());
  });
});
