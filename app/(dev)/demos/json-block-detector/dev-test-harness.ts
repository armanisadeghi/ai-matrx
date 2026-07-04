/**
 * DEV-ONLY test harness — NOT production code.
 * Fake stream simulation + glue that wires mock chunks into real parsers for demos.
 */

export type MockJsonStreamOptions = {
  minChunkSize?: number;
  maxChunkSize?: number;
  delayMs?: number;
  isCancelled?: () => boolean;
};

/**
 * Mimics streamed JSON arriving from an API/model in random-sized chunks.
 */
export async function* mockJsonStream(
  input: string,
  options: MockJsonStreamOptions = {},
): AsyncGenerator<string> {
  const minChunkSize = options.minChunkSize ?? 1;
  const maxChunkSize = options.maxChunkSize ?? 16;
  const delayMs = options.delayMs ?? 0;

  let index = 0;

  while (index < input.length) {
    if (options.isCancelled?.()) {
      return;
    }

    const size =
      minChunkSize +
      Math.floor(Math.random() * Math.max(1, maxChunkSize - minChunkSize + 1));

    const chunk = input.slice(index, index + size);
    index += size;

    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      if (options.isCancelled?.()) {
        return;
      }
    }

    yield chunk;
  }
}

