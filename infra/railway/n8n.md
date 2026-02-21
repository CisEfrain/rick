# n8n — Railway Deploy

## Steps
1. **Create a new service** in Railway using the existing `n8n` public template.
2. Railway's template sets up:
   - n8n container
   - PostgreSQL DB
   - Persistent Storage

## Tool Execution Flow

With the new v2 architecture, n8n purely manages **Function calls (Tools)** for the Deepgram Voice Agent. It no longer handles Speech-To-Text or Prompt Chaining.

1. Expose a webhook, e.g., `POST /webhook/tool`.
2. Grab the webhook production URL and set it as `N8N_TOOL_WEBHOOK_URL` in the `bridge` service.
3. Configure your webhook node to respond with the calculated Tool JSON data.

**Incoming Payload to n8n:**
```json
{
  "toolName": "buscar_clima",
  "args": { "ciudad": "Buenos Aires" },
  "callId": "123kjas-asd",
  "sessionId": "raspi-server"
}
```

Respond with a generic `200 OK` JSON object which will be passed back to the LLM agent to summarize and read aloud to the user.
