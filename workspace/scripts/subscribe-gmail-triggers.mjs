#!/usr/bin/env node
/**
 * Subscribe to Gmail (and other Composio) triggers via Supabase Realtime.
 * New emails → Composio webhook → agent_learnings → this script gets pushed.
 *
 * Usage:
 *   Set SUPABASE_URL and SUPABASE_ANON_KEY (e.g. in ~/.openclaw/.env), then:
 *   node workspace/scripts/subscribe-gmail-triggers.mjs
 *   # or from workspace dir:
 *   node scripts/subscribe-gmail-triggers.mjs
 *
 * Optional: OPENCLAW_ENV=/path/to/.env to load env from a file (Node does not load .env by default).
 */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://nljlsqgldgmxlbylqazg.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_ANON_KEY) {
  console.error('Missing SUPABASE_ANON_KEY. Set it in env or in ~/.openclaw/.env and run with:');
  console.error('  export $(grep -v "^#" ~/.openclaw/.env | xargs) && node scripts/subscribe-gmail-triggers.mjs');
  process.exit(1);
}

const { createClient } = await import('@supabase/supabase-js');
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const channel = supabase
  .channel('composio-triggers')
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'agent_learnings',
      filter: 'category=eq.composio_trigger'
    },
    (payload) => {
      const row = payload.new || {};
      const triggerName = Array.isArray(row.tags) ? row.tags[1] : row.tags?.[1];
      const meta = row.metadata || {};
      const learningPreview = typeof row.learning === 'string'
        ? (row.learning.length > 80 ? row.learning.slice(0, 80) + '...' : row.learning)
        : row.learning;
      console.log('[Gmail/trigger]', triggerName || 'composio_trigger', { learning: learningPreview, metadata: meta });
    }
  )
  .subscribe((status) => {
    if (status === 'SUBSCRIBED') console.log('Listening for Gmail/Composio triggers (agent_learnings INSERT, category=composio_trigger).');
    if (status === 'CHANNEL_ERROR') console.error('Realtime channel error.');
    if (status === 'TIMED_OUT') console.error('Realtime timed out.');
  });

process.on('SIGINT', () => {
  supabase.removeChannel(channel);
  process.exit(0);
});
