# SMS Reply Implementation - Notes

## Overview
SMS reply functionality has been implemented in `echelon-agent-worker.mjs` to handle end-to-end SMS conversations via Repo C's Twilio integration.

## New Environment Variables

Three new environment variables are required for SMS functionality:

- **`CIA_URL`** - Repo C base URL (e.g., `https://<project>.supabase.co`)
- **`CIA_ANON_KEY`** - Repo C anonymous API key for authentication
- **`EXECUTOR_SECRET`** - Bearer token for the `internal-execute` endpoint

These are optional - the worker will only fail SMS jobs if these are missing, non-SMS jobs continue to work without them.

## SMS Job Flow

1. **Job Detection**: Jobs with `metadata.source === "sms"` are detected early in `handleJob()`
2. **Session Isolation**: SMS jobs use per-tenant + per-sender session keys:
   - Format: `agent:main:sms:${tenantId}:${fromNumber}`
   - This ensures separate conversations for each sender
3. **Agent Processing**: The agent generates a reply using the existing chat flow
4. **SMS Send**: After getting the agent reply, the worker sends it via Repo C:
   - Endpoint: `POST ${CIA_URL}/functions/v1/internal-execute`
   - Service: `twilio`, Action: `messages.send`
   - Includes tenant ID in `X-Tenant-Id` header
5. **Job Ack**: Job is acked as `done` only after SMS send succeeds
   - If SMS send fails, job is acked as `failed` with error message
   - `response_text` is preserved even if SMS send fails (for debugging)

## Job Metadata Requirements

SMS jobs must include:
- `metadata.source = "sms"`
- `metadata.from_number` - The phone number to send the reply to (e.g., `"+1234567890"`)

If `from_number` is missing, the job will fail with a clear error message.

## Defensive Behavior

- **Missing `from_number`**: Job fails immediately in `handleJob()` with error: `"SMS job missing metadata.from_number"`
- **Missing env vars**: Job fails in `runLoop()` with error: `"SMS job requires CIA_URL, CIA_ANON_KEY, EXECUTOR_SECRET env vars"`
- **Repo C API failure**: Job is acked as `failed` with the API error message
- **Non-SMS jobs**: Unchanged behavior - no impact on existing functionality

## Code Changes

### Modified Functions
- `handleJob()` - Added SMS detection and session key logic
- `runLoop()` - Added SMS send after agent reply

### New Functions
- `sendSmsViaRepoC()` - Helper function for Repo C API calls

### New Constants
- `CIA_URL`, `CIA_ANON_KEY`, `EXECUTOR_SECRET` - Environment variables

### Updated Documentation
- Header comment updated with new env vars
- `--check` mode now validates new env vars

## Verification

Run with `--check` flag to verify configuration:
```bash
node workspace/scripts/echelon-agent-worker.mjs --check
```

This will display the status of all environment variables including the new SMS-related ones.

## Backward Compatibility

- **Non-SMS jobs**: Completely unchanged behavior
- **Existing session keys**: Preserved for non-SMS jobs (`agent:main:echelon:${tenantId}`)
- **No breaking changes**: All existing functionality remains intact
