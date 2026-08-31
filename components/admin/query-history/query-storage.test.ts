import { parseStoredQueryHistory } from './query-storage';

describe('SQL query history storage boundary', () => {
  it('reconstructs valid stored query records', () => {
    expect(
      parseStoredQueryHistory(
        JSON.stringify([
          {
            id: 'query-1',
            query: 'SELECT 1',
            timestamp: 1_000,
            result: [{ value: 1 }],
            executionTime: 12.5,
            tags: ['certification'],
            description: 'Safe terminal canary',
          },
        ]),
      ),
    ).toEqual([
      {
        id: 'query-1',
        query: 'SELECT 1',
        timestamp: 1_000,
        result: [{ value: 1 }],
        executionTime: 12.5,
        tags: ['certification'],
        description: 'Safe terminal canary',
      },
    ]);
  });

  it.each([
    'not json',
    JSON.stringify({ id: 'query-1' }),
    JSON.stringify([{ id: 'query-1', query: 'SELECT 1', timestamp: 'now' }]),
    JSON.stringify([
      { id: 'query-1', query: 'SELECT 1', timestamp: 1_000, tags: [1] },
    ]),
  ])('rejects malformed history without asserting its shape', (raw) => {
    expect(parseStoredQueryHistory(raw)).toBeNull();
  });
});
