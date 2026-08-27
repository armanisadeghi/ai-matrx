import { getCanvasViewScope } from '../canvasViewTracking';

describe('getCanvasViewScope', () => {
  it('refuses a guest direct insert even when the shared canvas has an organization', () => {
    expect(getCanvasViewScope(null, '5dc930e9-bd65-44a1-8369-af773f6e1a5b')).toBeNull();
  });

  it('refuses an actor-owned insert without an explicit organization', () => {
    expect(getCanvasViewScope('11111111-1111-4111-8111-111111111111', null)).toBeNull();
  });

  it('permits a fully scoped authenticated insert', () => {
    expect(
      getCanvasViewScope(
        '11111111-1111-4111-8111-111111111111',
        '5dc930e9-bd65-44a1-8369-af773f6e1a5b',
      ),
    ).toEqual({
      userId: '11111111-1111-4111-8111-111111111111',
      organizationId: '5dc930e9-bd65-44a1-8369-af773f6e1a5b',
    });
  });
});
