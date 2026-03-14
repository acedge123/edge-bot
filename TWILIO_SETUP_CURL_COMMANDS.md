# Twilio Tenant Setup - curl Commands

This document provides curl commands to set up Twilio as a tenant across Repo B and Repo C.

## Prerequisites

Before running these commands, you need:
- **Repo B Base URL**: `https://<repo-b-project>.supabase.co`
- **Repo C Base URL**: `https://<repo-c-project>.supabase.co`
- **Repo B Kernel API Key**: `acp_kernel_xxx` (for creating tenants)
- **Twilio Account SID**: From your Twilio dashboard
- **Twilio Auth Token**: From your Twilio dashboard

---

## Step 1: Create Twilio Tenant in Repo B

This creates the tenant and returns a `tenant_uuid`, `verification_token`, and an API key.

```bash
# Generate a unique idempotency key
IDEMPOTENCY_KEY=$(uuidgen || date +%s)

# Create the Twilio tenant
curl -X POST "https://<REPO_B_BASE_URL>/functions/v1/tenants-create" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <REPO_B_KERNEL_API_KEY>" \
  -H "Idempotency-Key: ${IDEMPOTENCY_KEY}" \
  -d '{
    "agent_id": "twilio",
    "email": "admin@twilio.com",
    "organization_name": "Twilio"
  }'
```

**Expected Response:**
```json
{
  "tenant_uuid": "00000000-0000-0000-0000-000000000000",
  "verification_token": "ver_xxx...",
  "api_key": "mcp_xxx...",
  "tenant_id": "..."
}
```

**Save these values:**
- `tenant_uuid` - Needed for Step 2
- `api_key` (starts with `mcp_`) - Needed for Steps 2 and 3

---

## Step 2: Store Twilio Credentials in Repo C

Store the Twilio Account SID and Auth Token in Repo C's credential store.

### Option A: Using Repo C's `/functions/v1/execute` endpoint

```bash
# Replace placeholders with values from Step 1 and your Twilio credentials
curl -X POST "https://<REPO_C_BASE_URL>/functions/v1/execute" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TENANT_API_KEY_FROM_STEP_1>" \
  -H "X-Tenant-Id: <TENANT_UUID_FROM_STEP_1>" \
  -d '{
    "service": "credentials",
    "action": "store",
    "params": {
      "tenant_uuid": "<TENANT_UUID_FROM_STEP_1>",
      "service": "twilio",
      "credentials": {
        "account_sid": "<YOUR_TWILIO_ACCOUNT_SID>",
        "auth_token": "<YOUR_TWILIO_AUTH_TOKEN>"
      }
    }
  }'
```

### Option B: Using Repo C's credential-store endpoint (if different)

```bash
curl -X POST "https://<REPO_C_BASE_URL>/functions/v1/credential-store" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TENANT_API_KEY_FROM_STEP_1>" \
  -H "X-Tenant-Id: <TENANT_UUID_FROM_STEP_1>" \
  -d '{
    "tenant_uuid": "<TENANT_UUID_FROM_STEP_1>",
    "service": "twilio",
    "account_sid": "<YOUR_TWILIO_ACCOUNT_SID>",
    "auth_token": "<YOUR_TWILIO_AUTH_TOKEN>"
  }'
```

**Note:** The exact endpoint and body format may vary based on Repo C's implementation. Check Repo C's documentation for the correct credential storage endpoint.

---

## Step 3: Register Twilio in MCP Registry

Register Twilio as a connector so the kernel knows how to route tool calls.

```bash
curl -X POST "https://<REPO_B_BASE_URL>/functions/v1/mcp-servers-register" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TENANT_API_KEY_FROM_STEP_1>" \
  -d '{
    "server_name": "twilio",
    "tenant_uuid": "<TENANT_UUID_FROM_STEP_1>",
    "connector_type": "twilio",
    "config": {
      "service": "twilio"
    }
  }'
```

**Alternative format (if different):**

```bash
curl -X POST "https://<REPO_B_BASE_URL>/functions/v1/manage" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TENANT_API_KEY_FROM_STEP_1>" \
  -H "X-API-Key: <TENANT_API_KEY_FROM_STEP_1>" \
  -d '{
    "action": "mcp.servers.register",
    "params": {
      "server_name": "twilio",
      "tenant_uuid": "<TENANT_UUID_FROM_STEP_1>",
      "connector_type": "twilio"
    }
  }'
```

---

## Complete Example Script

Here's a complete bash script that runs all three steps:

```bash
#!/bin/bash

# Configuration - REPLACE THESE VALUES
REPO_B_URL="https://<repo-b-project>.supabase.co"
REPO_C_URL="https://<repo-c-project>.supabase.co"
REPO_B_KERNEL_KEY="acp_kernel_xxx"
TWILIO_ACCOUNT_SID="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
TWILIO_AUTH_TOKEN="your_auth_token_here"

# Step 1: Create tenant
echo "Step 1: Creating Twilio tenant..."
IDEMPOTENCY_KEY=$(uuidgen 2>/dev/null || date +%s)
RESPONSE=$(curl -s -X POST "${REPO_B_URL}/functions/v1/tenants-create" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${REPO_B_KERNEL_KEY}" \
  -H "Idempotency-Key: ${IDEMPOTENCY_KEY}" \
  -d '{
    "agent_id": "twilio",
    "email": "admin@twilio.com",
    "organization_name": "Twilio"
  }')

# Extract values from response (requires jq)
TENANT_UUID=$(echo $RESPONSE | jq -r '.tenant_uuid')
TENANT_API_KEY=$(echo $RESPONSE | jq -r '.api_key')

echo "Tenant UUID: ${TENANT_UUID}"
echo "Tenant API Key: ${TENANT_API_KEY}"

if [ -z "$TENANT_UUID" ] || [ "$TENANT_UUID" = "null" ]; then
  echo "Error: Failed to create tenant"
  echo "Response: $RESPONSE"
  exit 1
fi

# Step 2: Store credentials in Repo C
echo ""
echo "Step 2: Storing Twilio credentials in Repo C..."
CRED_RESPONSE=$(curl -s -X POST "${REPO_C_URL}/functions/v1/execute" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TENANT_API_KEY}" \
  -H "X-Tenant-Id: ${TENANT_UUID}" \
  -d "{
    \"service\": \"credentials\",
    \"action\": \"store\",
    \"params\": {
      \"tenant_uuid\": \"${TENANT_UUID}\",
      \"service\": \"twilio\",
      \"credentials\": {
        \"account_sid\": \"${TWILIO_ACCOUNT_SID}\",
        \"auth_token\": \"${TWILIO_AUTH_TOKEN}\"
      }
    }
  }")

echo "Credential storage response: $CRED_RESPONSE"

# Step 3: Register in MCP registry
echo ""
echo "Step 3: Registering Twilio in MCP registry..."
MCP_RESPONSE=$(curl -s -X POST "${REPO_B_URL}/functions/v1/mcp-servers-register" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TENANT_API_KEY}" \
  -d "{
    \"server_name\": \"twilio\",
    \"tenant_uuid\": \"${TENANT_UUID}\",
    \"connector_type\": \"twilio\",
    \"config\": {
      \"service\": \"twilio\"
    }
  }")

echo "MCP registration response: $MCP_RESPONSE"

echo ""
echo "Setup complete!"
echo "Tenant UUID: ${TENANT_UUID}"
echo "Tenant API Key: ${TENANT_API_KEY}"
```

---

## Verification

After completing all steps, verify the setup:

1. **Check tenant exists in Repo B:**
   ```bash
   curl -X POST "https://<REPO_B_BASE_URL>/functions/v1/manage" \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer <TENANT_API_KEY>" \
     -H "X-API-Key: <TENANT_API_KEY>" \
     -d '{"action": "meta.tenants.get", "params": {"tenant_uuid": "<TENANT_UUID>"}}'
   ```

2. **Test Twilio credential retrieval (if Repo C supports it):**
   ```bash
   curl -X POST "https://<REPO_C_BASE_URL>/functions/v1/execute" \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer <TENANT_API_KEY>" \
     -H "X-Tenant-Id: <TENANT_UUID>" \
     -d '{
       "service": "credentials",
       "action": "get",
       "params": {
         "tenant_uuid": "<TENANT_UUID>",
         "service": "twilio"
       }
     }'
   ```

3. **Test SMS send via Repo C (as edge-bot does):**
   ```bash
   curl -X POST "https://<REPO_C_BASE_URL>/functions/v1/internal-execute" \
     -H "Content-Type: application/json" \
     -H "apikey: <REPO_C_ANON_KEY>" \
     -H "Authorization: Bearer <EXECUTOR_SECRET>" \
     -H "X-Tenant-Id: <TENANT_UUID>" \
     -d '{
       "service": "twilio",
       "action": "messages.send",
       "params": {
         "to": "+1234567890",
         "body": "Test message"
       }
     }'
   ```

---

## Notes

- **Idempotency Key**: Step 1 uses an idempotency key to prevent duplicate tenant creation if the request is retried.
- **API Key Format**: The tenant API key from Step 1 should start with `mcp_` and is used for tenant-scoped operations.
- **Credential Storage**: The exact endpoint and format for Step 2 may vary. Check Repo C's documentation for the correct credential storage API.
- **MCP Registry**: Step 3 may use different endpoint names (`mcp-servers-register` vs `/manage` with action). Check Repo B's documentation.
- **Security**: Never commit API keys or credentials. Use environment variables or secure secret management.

---

## Troubleshooting

### Step 1 fails with 401/403
- Verify the Repo B kernel API key is correct
- Check that the key has permissions to create tenants

### Step 2 fails
- Verify the tenant API key from Step 1 is correct
- Check Repo C's credential storage endpoint documentation
- Ensure the endpoint accepts the tenant API key format

### Step 3 fails
- Verify the MCP registry endpoint name
- Check if it should use `/manage` with an action instead
- Ensure the tenant API key has MCP registration permissions
