import { connectDirect, loadDbEnv } from "./lib/direct-db";

async function main() {
  const env = loadDbEnv();
  const client = await connectDirect(env as any, "review-ra-check");
  try {
    const res = await client.query(
      `select id, title, status, conversation_id, metadata from agent.review_queue where id = $1`,
      ["97371913-d3e0-4775-b731-0da6c46d0deb"]
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
