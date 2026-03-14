# SMS Reply Implementation Plan

## Overview
Implement end-to-end SMS reply functionality in `echelon-agent-worker.mjs` to handle SMS jobs that already have `metadata.source = "sms"` and send replies via Repo C's Twilio integration.

## Current State Analysis

### Existing Flow (Non-SMS Jobs)
1. `claimNextJob()` - Polls `/agent-next` endpoint
2. `handleJob(job)` - Processes job:
   - Extracts `job.id`, `job.tenant_id`, `job.text`
   - Uses session key: `agent:main:echelon:${tenantId}`
   - Sends message via `gatewayCall('chat.send', ...)`
   - Polls `chat.history` for assistant response
   - Returns response text
3. `ackJob(job.id, 'done', { responseText })` - Acks job as done
4. `runLoop()` - Main loop that orchestrates the above

### Key Observations
- Jobs are accessed via `job.id`, `job.tenant_id`, `job.text`
- Metadata is not currently accessed (no `job.metadata` usage found)
- Session keys follow pattern: `agent:main:<source>:<identifier>`
- Similar pattern exists in `jobs-worker.mjs` for `chat_ui` jobs with per-user sessions

## Implementation Plan

### 1. Environment Variables Setup

**New Required Env Vars:**
- `CIA_URL` - Repo C base URL (e.g., `https://<project>.supabase.co`)
- `CIA_ANON_KEY` - Repo C anonymous key for API authentication
- `EXECUTOR_SECRET` - Bearer token for internal-execute endpoint

**Location:** Add to top-level env loading section (after line 51)

**Validation:** 
- For `--check` mode: Log presence/absence (masked) like `AGENT_HOSTED_EDGE_KEY`
- For runtime: Only validate when processing SMS jobs (fail fast with clear error)

### 2. SMS Detection Logic

**Location:** Early in `handleJob()` function (after line 160)

**Implementation:**
```javascript
const metadata = job.metadata || {};
const isSmsJob = String(metadata.source || '').trim() === 'sms';
```

**Behavior:**
- If `isSmsJob === false`, use existing flow (no changes)
- If `isSmsJob === true`, proceed with SMS-specific handling

### 3. SMS Session Key Generation

**Location:** In `handleJob()`, replace or conditionally set `sessionKey` (around line 162)

**Implementation:**
```javascript
let sessionKey;
if (isSmsJob) {
  const fromNumber = String(metadata.from_number || '').trim();
  if (!fromNumber) {
    throw new Error('SMS job missing metadata.from_number');
  }
  sessionKey = `agent:main:sms:${tenantId}:${fromNumber}`;
} else {
  sessionKey = `agent:main:echelon:${tenantId}`;
}
```

**Rationale:**
- Per-tenant + per-sender isolation ensures separate conversations
- Matches pattern used in `jobs-worker.mjs` for `chat_ui` (per-user sessions)

### 4. Repo C SMS Send Function

**Location:** New helper function after `postWake()` (around line 148)

**Function Signature:**
```javascript
async function sendSmsViaRepoC({ tenantId, toNumber, messageText })
```

**Implementation Details:**
- Endpoint: `POST ${CIA_URL}/functions/v1/internal-execute`
- Headers:
  - `apikey: ${CIA_ANON_KEY}`
  - `Authorization: Bearer ${EXECUTOR_SECRET}`
  - `X-Tenant-Id: ${tenantId}`
  - `Content-Type: application/json`
- Body:
  ```json
  {
    "service": "twilio",
    "action": "messages.send",
    "params": {
      "to": "<toNumber>",
      "body": "<messageText>"
    }
  }
  ```
- Error handling: Throw descriptive errors for HTTP failures
- Timeout: Use reasonable timeout (e.g., 30s) for external API call

**Validation:**
- Check env vars exist before making call
- Throw clear error if missing: `"SMS job requires CIA_URL, CIA_ANON_KEY, EXECUTOR_SECRET env vars"`

### 5. Modified Job Handling Flow

**Location:** `runLoop()` function (around lines 214-223)

**Current Flow:**
```javascript
const responseText = await handleJob(job);
await ackJob(job.id, 'done', { responseText });
```

**New Flow for SMS Jobs:**
```javascript
const responseText = await handleJob(job);

// For SMS jobs, send reply via Repo C before acking
const metadata = job.metadata || {};
const isSmsJob = String(metadata.source || '').trim() === 'sms';

if (isSmsJob) {
  const fromNumber = String(metadata.from_number || '').trim();
  if (!fromNumber) {
    throw new Error('SMS job missing metadata.from_number');
  }
  
  // Validate env vars
  if (!CIA_URL || !CIA_ANON_KEY || !EXECUTOR_SECRET) {
    throw new Error('SMS job requires CIA_URL, CIA_ANON_KEY, EXECUTOR_SECRET env vars');
  }
  
  // Send SMS reply
  await sendSmsViaRepoC({
    tenantId: job.tenant_id || job.tenantId || 'default',
    toNumber: fromNumber,
    messageText: responseText
  });
}

await ackJob(job.id, 'done', { responseText });
```

**Error Handling:**
- If SMS send fails, ack as `failed` with error message
- Keep `responseText` in ack even if SMS send fails (for debugging)

### 6. Defensive Checks

**Missing `from_number` Check:**
- Location: In `handleJob()` when `isSmsJob === true`
- Action: Throw error immediately: `"SMS job missing metadata.from_number"`
- Result: Job will be acked as `failed` in `runLoop()` catch block

**Missing Env Vars Check:**
- Location: In `runLoop()` before calling `sendSmsViaRepoC()`
- Action: Throw error: `"SMS job requires CIA_URL, CIA_ANON_KEY, EXECUTOR_SECRET env vars"`
- Result: Job will be acked as `failed`

**Non-SMS Jobs:**
- No changes to existing behavior
- Existing session key pattern preserved
- No Repo C calls for non-SMS jobs

### 7. Code Organization

**Structure:**
1. Top-level env vars (after line 51)
2. Helper function `sendSmsViaRepoC()` (after `postWake()`)
3. Modified `handleJob()` - SMS detection and session key logic
4. Modified `runLoop()` - SMS send after agent reply

**Minimal Changes:**
- Only modify `handleJob()` and `runLoop()`
- Add one new helper function
- No changes to `claimNextJob()`, `ackJob()`, `gatewayCall()`, `postWake()`

### 8. Logging Considerations

**Add Logs:**
- SMS job detected: `[echelon-worker] job ${job.id} → SMS (from: ${fromNumber})`
- SMS sent successfully: `[echelon-worker] job ${job.id} → SMS sent to ${toNumber}`
- SMS send failure: Already logged via error in catch block

**Avoid:**
- Logging full message text (privacy)
- Logging secrets (env var values)
- Verbose logging in hot path

### 9. `--check` Mode Support

**Location:** In `--check` block (around lines 59-74)

**Add:**
```javascript
console.log('  CIA_URL:', CIA_URL || '(missing)');
console.log('  CIA_ANON_KEY:', CIA_ANON_KEY ? '***set***' : '(missing)');
console.log('  EXECUTOR_SECRET:', EXECUTOR_SECRET ? '***set***' : '(missing)');
```

**Note:** Don't make actual API calls in `--check` mode (as per requirements)

### 10. Testing Strategy

**Unit Test Scenarios:**
1. Non-SMS job → existing behavior unchanged
2. SMS job with valid `from_number` → SMS-specific session key used
3. SMS job missing `from_number` → fails with clear error
4. SMS job with missing env vars → fails with clear error
5. SMS job with Repo C API failure → job acked as failed
6. SMS job with successful send → job acked as done

**Integration Points:**
- Verify `job.metadata.source === "sms"` detection
- Verify session key format: `agent:main:sms:${tenantId}:${fromNumber}`
- Verify Repo C API call format matches spec
- Verify ack behavior (done vs failed)

## Implementation Checklist

- [ ] Add env var declarations (`CIA_URL`, `CIA_ANON_KEY`, `EXECUTOR_SECRET`)
- [ ] Add env var logging in `--check` mode
- [ ] Create `sendSmsViaRepoC()` helper function
- [ ] Add SMS detection in `handleJob()` (check `metadata.source`)
- [ ] Add SMS session key logic in `handleJob()`
- [ ] Add `from_number` validation in `handleJob()`
- [ ] Add SMS send logic in `runLoop()` after `handleJob()` returns
- [ ] Add env var validation before SMS send
- [ ] Add error handling for SMS send failures
- [ ] Add minimal logging for SMS flow
- [ ] Verify non-SMS jobs unchanged
- [ ] Test with `--check` flag

## Risk Mitigation

**Breaking Changes:**
- Low risk: SMS detection is opt-in via metadata check
- Non-SMS jobs follow exact same path as before

**Error Scenarios:**
- Missing metadata: Clear error message, job fails gracefully
- Missing env vars: Clear error message, job fails gracefully
- Repo C API failure: Error caught, job acked as failed, response_text preserved

**Performance:**
- SMS jobs add one external API call (~100-500ms)
- No impact on non-SMS jobs
- Timeout protection prevents hanging

## Documentation Notes

**New Env Vars (to document):**
- `CIA_URL` - Repo C base URL for SMS sending
- `CIA_ANON_KEY` - Repo C anonymous API key
- `EXECUTOR_SECRET` - Bearer token for internal-execute endpoint

**SMS Job Flow:**
1. Job created with `metadata.source = "sms"` and `metadata.from_number = "+1234567890"`
2. Worker detects SMS job via metadata check
3. Uses SMS-specific session key: `agent:main:sms:${tenantId}:${fromNumber}`
4. Agent generates reply via existing chat flow
5. Worker sends reply via Repo C `internal-execute` endpoint (Twilio)
6. Job acked as `done` only after SMS send succeeds
7. If SMS send fails, job acked as `failed` with error

**Backward Compatibility:**
- Jobs without `metadata.source = "sms"` continue to work exactly as before
- No changes to existing session key format for non-SMS jobs
- No changes to ack behavior for non-SMS jobs
