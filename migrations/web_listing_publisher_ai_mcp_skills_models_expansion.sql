-- Wide expansion of the AI/ML/automation niche (common-docs/systems/marketing/local-listings/PLAN.md WS7).
-- Follow-on from web_listing_publisher_ai_ml_automation_niche.sql: the finding was that building
-- APIs, MCP servers, agent skills, prompts, and even open-weight fine-tunes each unlock their own
-- artifact-specific directory ecosystem, distinct from business-listing directories. Covers: MCP
-- server registries, Claude/agent skill marketplaces, prompt marketplaces, open-model hosting
-- (for backlink/authority reach, not model-quality competition), dev/IDE extension marketplaces,
-- the LangChain prompt hub, no-code template galleries, and open-source package registries.
-- Deduped against the live registry (zapier.com and n8n.io already present via the automation
-- marketplaces migration; huggingface.co and github.com already present).
-- APPLIED LIVE via Supabase (linked project txzxabzwovsujtloxrus). Idempotent upsert by slug; system org.
insert into web.listing_publisher (organization_id, slug, name, domain, tier, is_aggregator, api_access, api_notes, manage_url, categories, citation_weight, sort_rank, visibility)
select '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, v.* from (values
  -- MCP (Model Context Protocol) server registries -- Anthropic's own protocol; highest strategic fit
  ('mcp-registry-official','Official MCP Registry','registry.modelcontextprotocol.io','high_value',true,'open','Anthropic/GitHub/Microsoft/PulseMCP-backed community registry, preview launched Sept 2025; publishes server.json via GitHub-auth CLI after the package is on npm. Primary source of truth other MCP directories sync from.','https://modelcontextprotocol.io/registry/quickstart','{ai,mcp,dev-tools}'::text[],65,900,'public'::platform.visibility),
  ('mcp-so','MCP.so','mcp.so','vertical',false,'none','20,000+ servers; community-led directory, submit via GitHub issue.',null,'{ai,mcp,dev-tools}',35,902,'public'),
  ('smithery-ai','Smithery','smithery.ai','high_value',false,'open','"Package manager" for the MCP ecosystem; 430,000+ monthly developers; CLI-based self-serve publish.',null,'{ai,mcp,dev-tools}',45,904,'public'),
  ('glama-ai-mcp','Glama MCP Directory','glama.ai','vertical',false,'open','MCP server directory with self-serve listing.',null,'{ai,mcp,dev-tools}',30,906,'public'),
  ('pulsemcp','PulseMCP','pulsemcp.com','vertical',false,'none','MCP news/directory site; one of the trusted contributors backing the official registry.',null,'{ai,mcp,dev-tools}',30,908,'public'),
  ('mcpmarket-com','MCP Market','mcpmarket.com','vertical',false,'none','MCP server marketplace/directory, browsable by client (Cursor, Claude, etc).',null,'{ai,mcp,dev-tools}',25,910,'public'),
  ('cursor-mcp-directory','Cursor MCP Directory','cursor.com','vertical',false,'approval','Cursor''s official in-editor MCP marketplace (Customize > Browse Marketplace); listing is curated by the Cursor team.','https://cursor.com/docs/mcp/directory','{ai,mcp,dev-tools}',35,912,'public'),
  ('cursor-directory','Cursor Directory','cursor.directory','vertical',false,'none','Community-run directory of Cursor plugins, MCP servers, and rules files.',null,'{ai,mcp,dev-tools}',25,914,'public'),
  ('composio','Composio','composio.dev','vertical',false,'open','MCP + 1,000+ app integration platform for agents; self-serve developer signup.',null,'{ai,mcp,dev-tools}',35,916,'public'),

  -- Agent skill marketplaces (Claude Skills / agentskills.io open standard)
  ('lobehub-skills','LobeHub Skills','lobehub.com','vertical',false,'none','169,000+ skills aggregated across Claude/Codex/ChatGPT; polished discovery UI.','https://lobehub.com/skills','{ai,skills}',35,918,'public'),
  ('skills-sh','Skills.sh','skills.sh','vertical',false,'open','Vercel-backed, npm-style package manager for agent skills; one-command CLI publish/install across Claude Code, Codex CLI, Cursor.',null,'{ai,skills}',35,920,'public'),
  ('skillsmp','SkillsMP','skillsmp.com','long_tail',false,'none','~1.9M public skills scraped from GitHub; low curation bar, high volume.',null,'{ai,skills}',15,922,'public'),
  ('claudeskills-info','ClaudeSkills.info','claudeskills.info','vertical',false,'none','658+ community-contributed skills alongside official Anthropic skills.',null,'{ai,skills}',25,924,'public'),
  ('awesome-claude-skills','Awesome Claude Skills','awesomeclaude.ai','vertical',false,'none','Curated, categorized skills directory.','https://awesomeclaude.ai/awesome-claude-skills','{ai,skills}',25,926,'public'),
  ('agentskill-club','AgentSkill.Club','agentskill.club','vertical',false,'none','3,640+ free open-source Claude/MCP-compatible skills.',null,'{ai,skills}',25,928,'public'),

  -- Prompt marketplaces
  ('promptbase','PromptBase','promptbase.com','high_value',false,'none','Largest prompt marketplace, 500,000+ listings; 80% seller revenue share, self-serve seller signup.',null,'{ai,prompts}',35,930,'public'),
  ('flowgpt','FlowGPT','flowgpt.com','vertical',false,'none','Free, community-driven ChatGPT workflow-prompt platform.',null,'{ai,prompts}',25,932,'public'),

  -- Open-model hosting (reach/backlink play, not a quality-leaderboard play)
  ('ollama-library','Ollama Library','ollama.com','high_value',false,'open','Self-serve: `ollama create` + push publishes a model to the public library.',null,'{ai,models}',40,934,'public'),
  ('replicate','Replicate','replicate.com','high_value',false,'open','Self-serve model deploy with a public model page; pay-per-use hosted inference.',null,'{ai,models}',40,936,'public'),
  ('openrouter','OpenRouter','openrouter.ai','vertical',false,'approval','Unified model marketplace/inference router; listing as a model provider requires an application.',null,'{ai,models}',35,938,'public'),

  -- Dev / IDE extension marketplaces
  ('vscode-marketplace','Visual Studio Code Marketplace','marketplace.visualstudio.com','high_value',false,'open','Free self-serve publisher account (Microsoft account + Personal Access Token); no API-key fee.',null,'{ai,dev-tools}',45,940,'public'),
  ('jetbrains-marketplace','JetBrains Marketplace','plugins.jetbrains.com','vertical',false,'open','Free self-serve plugin publishing.',null,'{ai,dev-tools}',35,942,'public'),
  ('chrome-web-store','Chrome Web Store','chromewebstore.google.com','high_value',false,'open','Free self-serve developer account (one-time $5 registration fee); review-gated publish. Directly relevant to matrx-extend.',null,'{ai,dev-tools}',45,944,'public'),

  -- LangChain ecosystem
  ('langsmith-prompt-hub','LangSmith Prompt Hub','smith.langchain.com','vertical',false,'open','Self-serve `push_prompt()` under a namespaced handle, with a public-sharing option.',null,'{ai,prompts,dev-tools}',30,946,'public'),

  -- No-code template marketplaces (adjacent reach for automation/AI workflow templates)
  ('notion-template-gallery','Notion Template Gallery','notion.com','vertical',false,'approval','Official gallery requires template-creator application/review; community templates can also be self-shared via link.',null,'{ai,automation,templates}',35,948,'public'),
  ('airtable-universe','Airtable Universe','airtable.com','vertical',false,'none','Community template-sharing gallery; self-serve publish of any base as a template.','https://www.airtable.com/templates','{ai,automation,templates}',25,950,'public'),

  -- Open-source package registries (for AI Matrx''s own SDKs/packages -- pure citation/backlink value)
  ('npm-registry','npm','npmjs.com','high_value',false,'open','World''s largest JS/TS package registry; free self-serve publish.',null,'{ai,dev-tools}',40,952,'public'),
  ('pypi','PyPI','pypi.org','high_value',false,'open','Canonical Python Package Index; free self-serve publish (twine/trusted publishing via OIDC).',null,'{ai,dev-tools}',40,954,'public')
) as v(slug, name, domain, tier, is_aggregator, api_access, api_notes, manage_url, categories, citation_weight, sort_rank, visibility)
on conflict (slug) do update set
  name = excluded.name,
  domain = excluded.domain,
  tier = excluded.tier,
  is_aggregator = excluded.is_aggregator,
  api_access = excluded.api_access,
  api_notes = excluded.api_notes,
  manage_url = excluded.manage_url,
  categories = excluded.categories,
  citation_weight = excluded.citation_weight,
  sort_rank = excluded.sort_rank,
  visibility = excluded.visibility,
  updated_at = now();
