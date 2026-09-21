import { connectDirect, loadDbEnv } from "./lib/direct-db";

async function main() {
  const env = loadDbEnv();
  const client = await connectDirect(env as any, "review-ra-conv");
  try {
    const res = await client.query(
      `select id, created_at, content, metadata from communication.dm_messages where conversation_id = $1 order by created_at asc`,
      ["0be3d29d-fd91-450b-b551-8d44b3f11e35"]
    );
    console.log(JSON.stringify(res.rows, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
