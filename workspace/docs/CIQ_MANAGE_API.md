# CIQ Manage API (Supabase Edge Function)

Endpoint: `POST https://your-project.supabase.co/functions/v1/manage`

Auth: header `X-API-Key: $platform_key` — use env var `platform_key` (platform/tenant API key from signup/onboarding, e.g. `ciq_xxx`). The manage router resolves tenant and fetches the CIQ credential server-side. Never pass the raw CreatorIQ API key.

Body shape:
```json
{
  "action": "<action.name>",
  "params": {},
  "dry_run": false
}
```

This tenant currently exposes **59** actions.

## domain.ciq

### `domain.ciq.campaigns.create`

- **Scope:** `manage.domain`
- **Dry-run supported:** yes
- **Description:** Create a new campaign

**Params schema**
```json
{
  "type": "object",
  "properties": {
    "name": {
      "type": "string"
    },
    "description": {
      "type": "string"
    },
    "start_date": {
      "type": "string"
    },
    "end_date": {
      "type": "string"
    }
  },
  "required": [
    "name"
  ]
}
```

### `domain.ciq.campaigns.get`

- **Scope:** `manage.read`
- **Dry-run supported:** no
- **Description:** Get a single campaign

**Params schema**
```json
{
  "type": "object",
  "properties": {
    "campaign_id": {
      "type": "string"
    }
  },
  "required": [
    "campaign_id"
  ]
}
```

### `domain.ciq.campaigns.list`

- **Scope:** `manage.read`
- **Dry-run supported:** no
- **Description:** List all campaigns

**Params schema**
```json
{
  "type": "object",
  "properties": {
    "page": {
      "type": "number"
    },
    "size": {
      "type": "number"
    },
    "debug": {
      "type": "boolean"
    }
  }
}
```

### `domain.ciq.campaigns.publishers.add`

- **Scope:** `manage.domain`
- **Dry-run supported:** yes
- **Description:** Add a publisher to a campaign

**Params schema**
```json
{
  "type": "object",
  "properties": {
    "campaign_id": {
      "type": "string"
    },
    "publisher_id": {
      "type": "string"
    },
    "status": {
      "type": "string"
    }
  },
  "required": [
    "campaign_id",
    "publisher_id"
  ]
}
```

### `domain.ciq.campaigns.publishers.details.update`

- **Scope:** `manage.domain`
- **Dry-run supported:** yes
- **Description:** Update details for a specific publisher in a campaign (platforms, required posts, notes, dates)

**Params schema**
```json
{
  "type": "object",
  "properties": {
    "campaign_id": {
      "type": "string"
    },
    "publisher_id": {
      "type": "string"
    },
    "patch": {
      "type": "object"
    }
  },
  "required": [
    "campaign_id",
    "publisher_id",
    "patch"
  ]
}
```

### `domain.ciq.campaigns.publishers.list`

- **Scope:** `manage.read`
- **Dry-run supported:** no
- **Description:** List publishers in a campaign

**Params schema**
```json
{
  "type": "object",
  "properties": {
    "campaign_id": {
      "type": "string"
    },
    "page": {
      "type": "number"
    },
    "size": {
      "type": "number"
    },
    "fields": {
      "type": "string"
    },
    "debug": {
      "type": "boolean"
    }
  },
  "required": [
    "campaign_id"
  ]
}
```

### `domain.ciq.campaigns.publishers.remove`

- **Scope:** `manage.domain`
- **Dry-run supported:** yes
- **Description:** Remove a publisher from a campaign

**Params schema**
```json
{
  "type": "object",
  "properties": {
    "campaign_id": {
      "type": "string"
    },
    "publisher_id": {
      "type": "string"
    }
  },
  "required": [
    "campaign_id",
    "publisher_id"
  ]
}
```

### `domain.ciq.campaigns.publishers.status.update`

- **Scope:** `manage.domain`
- **Dry-run supported:** yes
- **Description:** Update status of publishers in a campaign

**Params schema**
```json
{
  "type": "object",
  "properties": {
    "campaign_id": {
      "type": "string"
    },
    "publisher_ids": {
      "type": "array",
      "items": {
        "type": "number"
      }
    },
    "status": {
      "type": "string",
      "enum": [
        "Accepted",
        "Invited",
        "Selected",
        "Declined"
      ]
    }
  },
  "required": [
    "campaign_id",
    "publisher_ids",
    "status"
  ]
}
```

### `domain.ciq.campaigns.update`

- **Scope:** `manage.domain`
- **Dry-run supported:** yes
- **Description:** Update an existing campaign

**Params schema**
```json
{
  "type": "object",
  "properties": {
    "campaign_id": {
      "type": "string"
    },
    "patch": {
      "type": "object"
    }
  },
  "required": [
    "campaign_id",
    "patch"
  ]
}
```

### `domain.ciq.discovery.account.get`

- **Scope:** `manage.read`
- **Dry-run supported:** no
- **Description:** Lookup a social account by username and network from CIQ master database. Returns detailed profile, engagement metrics, audience data. Set resolve_crm=true to check if creator already exists in CRM.

**Params schema**
```json
{
  "type": "object",
  "properties": {
    "username": {
      "type": "string",
      "description": "Social account username/handle (without @)"
    },
    "network": {
      "type": "string",
      "enum": [
        "instagram",
        "tiktok",
        "youtube",
        "twitter",
        "facebook",
        "twitch",
        "pinterest"
      ],
      "description": "Social network name"
    },
    "resolve_crm": {
      "type": "boolean",
      "description": "If true, cross-check CRM and return crm.exists + publisher_id if found. Default false."
    }
  },
  "required": [
    "username",
    "network"
  ]
}
```

### `domain.ciq.discovery.lookup`

- **Scope:** `manage.read`
- **Dry-run supported:** no
- **Description:** Lookup a social account by URL from CIQ master database (not limited to your CRM). Returns profile info, followers, engagement.

**Params schema**
```json
{
  "type": "object",
  "properties": {
    "link": {
      "type": "string",
      "description": "Full social media URL, e.g. https://www.instagram.com/nike"
    }
  },
  "required": [
    "link"
  ]
}
```

### `domain.ciq.discovery.search`

- **Scope:** `manage.read`
- **Dry-run supported:** no
- **Description:** Search for creators in your CIQ CRM by filters (gender, country, category, tags, status, size, etc). Useful for finding creators matching a brief.

**Params schema**
```json
{
  "type": "object",
  "properties": {
    "filter": {
      "type": "string",
      "description": "CIQ filter syntax: Column1=Value1,Value2;Column2=Value3. E.g. Gender=Female;Country=US;Category=Fitness"
    },
    "order": {
      "type": "string",
      "description": "Sort order, e.g. TotalSubscribers,desc"
    },
    "page": {
      "type": "number"
    },
    "size": {
      "type": "number"
    },
    "fields": {
      "type": "string",
      "description": "Comma-separated fields to return, e.g. PublisherName,Gender,Country,TotalSubscribers,Category,Tags"
    }
  }
}
```

### `domain.ciq.email.templates.list`

- **Scope:** `manage.read`
- **Dry-run supported:** no
- **Description:** List email templates

**Params schema**
```json
{
  "type": "object",
  "properties": {
    "filter": {
      "type": "string"
    },
    "size": {
      "type": "number"
    }
  }
}
```

### `domain.ciq.links.create`

- **Scope:** `manage.domain`
- **Dry-run supported:** yes
- **Description:** Create affiliate tracking links for a campaign publisher

**Params schema**
```json
{
  "type": "object",
  "properties": {
    "campaign_id": {
      "type": "string"
    },
    "publisher_id": {
      "type": "string"
    },
    "original_url": {
      "type": "string"
    },
    "label": {
      "type": "string"
    },
    "instruction": {
      "type": "string"
    }
  },
  "required": [
    "campaign_id",
    "publisher_id",
    "original_url"
  ]
}
```

### `domain.ciq.links.report`

- **Scope:** `manage.read`
- **Dry-run supported:** no
- **Description:** Get link tracking report for a campaign

**Params schema**
```json
{
  "type": "object",
  "properties": {
    "campaign_id": {
      "type": "string"
    },
    "partner_id": {
      "type": "number"
    },
    "page": {
      "type": "number"
    },
    "size": {
      "type": "number"
    }
  },
  "required": [
    "campaign_id"
  ]
}
```

### `domain.ciq.lists.create`

- **Scope:** `manage.domain`
- **Dry-run supported:** yes
- **Description:** Create a new list

**Params schema**
```json
{
  "type": "object",
  "properties": {
    "name": {
      "type": "string"
    },
    "description": {
      "type": "string"
    },
    "publisher_ids": {
      "type": "array",
      "items": {
        "type": "number"
      }
    }
  },
  "required": [
    "name"
  ]
}
```

### `domain.ciq.lists.get`

- **Scope:** `manage.read`
- **Dry-run supported:** no
- **Description:** Get a single list by ID

**Params schema**
```json
{
  "type": "object",
  "properties": {
    "list_id": {
      "type": "string"
    }
  },
  "required": [
    "list_id"
  ]
}
```

### `domain.ciq.lists.list`

- **Scope:** `manage.read`
- **Dry-run supported:** no
- **Description:** List all lists

**Params schema**
```json
{
  "type": "object",
  "properties": {
    "page": {
      "type": "number"
    },
    "size": {
      "type": "number"
    },
    "debug": {
      "type": "boolean"
    }
  }
}
```

### `domain.ciq.lists.publishers.add`

- **Scope:** `manage.domain`
- **Dry-run supported:** yes
- **Description:** Add publishers to a list

**Params schema**
```json
{
  "type": "object",
  "properties": {
    "list_id": {
      "type": "string"
    },
    "publisher_ids": {
      "type": "array",
      "items": {
        "type": "number"
      }
    }
  },
  "required": [
    "list_id",
    "publisher_ids"
  ]
}
```

### `domain.ciq.lists.publishers.remove`

- **Scope:** `manage.domain`
- **Dry-run supported:** yes
- **Description:** Remove publishers from a list

**Params schema**
```json
{
  "type": "object",
  "properties": {
    "list_id": {
      "type": "string"
    },
    "publisher_ids": {
      "type": "array",
      "items": {
        "type": "number"
      }
    }
  },
  "required": [
    "list_id",
    "publisher_ids"
  ]
}
```

### `domain.ciq.messaging.bulk.send`

- **Scope:** `manage.domain`
- **Dry-run supported:** yes
- **Description:** Send bulk messages to publishers

**Params schema**
```json
{
  "type": "object",
  "properties": {
    "publisher_ids": {
      "type": "array",
      "items": {
        "type": "number"
      }
    },
    "subject": {
      "type": "string"
    },
    "message": {
      "type": "string"
    },
    "from_user_id": {
      "type": "number"
    },
    "show_body_in_chat": {
      "type": "boolean"
    }
  },
  "required": [
    "publisher_ids",
    "subject",
    "message"
  ]
}
```

### `domain.ciq.messaging.send`

- **Scope:** `manage.domain`
- **Dry-run supported:** yes
- **Description:** Send a message to a publisher

**Params schema**
```json
{
  "type": "object",
  "properties": {
    "publisher_id": {
      "type": "string"
    },
    "subject": {
      "type": "string"
    },
    "message": {
      "type": "string"
    }
  },
  "required": [
    "publisher_id",
    "subject",
    "message"
  ]
}
```

### `domain.ciq.onesheets.create`

- **Scope:** `manage.domain`
- **Dry-run supported:** yes
- **Description:** Create a new onesheet

**Params schema**
```json
{
  "type": "object",
  "properties": {
    "name": {
      "type": "string"
    },
    "description": {
      "type": "string"
    },
    "campaign_id": {
      "type": "string"
    },
    "publisher_ids": {
      "type": "array",
      "items": {
        "type": "number"
      }
    },
    "visibility": {
      "type": "boolean"
    }
  },
  "required": [
    "name"
  ]
}
```

### `domain.ciq.onesheets.get`

- **Scope:** `manage.read`
- **Dry-run supported:** no
- **Description:** Get a single onesheet

**Params schema**
```json
{
  "type": "object",
  "properties": {
    "onesheet_id": {
      "type": "string"
    }
  },
  "required": [
    "onesheet_id"
  ]
}
```

### `domain.ciq.onesheets.list`

- **Scope:** `manage.read`
- **Dry-run supported:** no
- **Description:** List all onesheets

**Params schema**
```json
{
  "type": "object",
  "properties": {
    "page": {
      "type": "number"
    },
    "size": {
      "type": "number"
    },
    "debug": {
      "type": "boolean"
    }
  }
}
```

### `domain.ciq.onesheets.publisher.get`

- **Scope:** `manage.read`
- **Dry-run supported:** no
- **Description:** Get a specific creator from a onesheet

**Params schema**
```json
{
  "type": "object",
  "properties": {
    "onesheet_id": {
      "type": "string"
    },
    "publisher_id": {
      "type": "string"
    },
    "fields": {
      "type": "string"
    }
  },
  "required": [
    "onesheet_id",
    "publisher_id"
  ]
}
```

### `domain.ciq.onesheets.publishers.add`

- **Scope:** `manage.domain`
- **Dry-run supported:** yes
- **Description:** Add publishers to a onesheet

**Params schema**
```json
{
  "type": "object",
  "properties": {
    "onesheet_id": {
      "type": "string"
    },
    "publisher_ids": {
      "type": "array",
      "items": {
        "type": "number"
      }
    }
  },
  "required": [
    "onesheet_id",
    "publisher_ids"
  ]
}
```

### `domain.ciq.publishers.contact.get`

- **Scope:** `manage.read`
- **Dry-run supported:** no
- **Description:** Get contact information for a publisher

**Params schema**
```json
{
  "type": "object",
  "properties": {
    "publisher_id": {
      "type": "string"
    }
  },
  "required": [
    "publisher_id"
  ]
}
```

### `domain.ciq.publishers.create`

- **Scope:** `manage.domain`
- **Dry-run supported:** yes
- **Description:** Create a new publisher in the CRM. Pass accounts array to auto-link social profiles. Returns the new internal Id usable for campaigns/lists/messaging.

**Params schema**
```json
{
  "type": "object",
  "properties": {
    "publisher_name": {
      "type": "string",
      "description": "Display name (required if no accounts provided)"
    },
    "accounts": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "description": "Social username or YouTube channel ID"
          },
          "network": {
            "type": "string",
            "description": "e.g. Instagram, TikTok, YouTube"
          }
        },
        "required": [
          "id",
          "network"
        ]
      },
      "description": "Social accounts to link (required if no publisher_name)"
    },
    "language": {
      "type": "string"
    },
    "tags": {
      "type": "string",
      "description": "Comma-separated tags"
    },
    "country": {
      "type": "string"
    },
    "flagship_property": {
      "type": "string",
      "description": "Main social handle"
    },
    "flagship_social_network": {
      "type": "string",
      "description": "Main social network"
    },
    "logo_url": {
      "type": "string"
    },
    "date_of_birth": {
      "type": "string"
    },
    "ethnic_background": {
      "type": "string"
    },
    "recruiter_name": {
      "type": "string"
    }
  }
}
```

### `domain.ciq.publishers.get`

- **Scope:** `manage.read`
- **Dry-run supported:** no
- **Description:** Get a single publisher by ID

**Params schema**
```json
{
  "type": "object",
  "properties": {
    "publisher_id": {
      "type": "string"
    },
    "key": {
      "type": "string",
      "enum": [
        "Id",
        "PublisherId",
        "NetworkPublisherId"
      ]
    }
  },
  "required": [
    "publisher_id"
  ]
}
```

### `domain.ciq.publishers.list`

- **Scope:** `manage.read`
- **Dry-run supported:** no
- **Description:** List all publishers for the brand

**Params schema**
```json
{
  "type": "object",
  "properties": {
    "page": {
      "type": "number"
    },
    "size": {
      "type": "number"
    },
    "filters": {
      "type": "object"
    },
    "debug": {
      "type": "boolean"
    }
  }
}
```

### `domain.ciq.publishers.notes.create`

- **Scope:** `manage.domain`
- **Dry-run supported:** yes
- **Description:** Create a note on a publisher

**Params schema**
```json
{
  "type": "object",
  "properties": {
    "publisher_id": {
      "type": "string"
    },
    "note_text": {
      "type": "string"
    },
    "tags": {
      "type": "array",
      "items": {
        "type": "string"
      }
    }
  },
  "required": [
    "publisher_id",
    "note_text"
  ]
}
```

### `domain.ciq.publishers.notes.list`

- **Scope:** `manage.read`
- **Dry-run supported:** no
- **Description:** List notes for a publisher

**Params schema**
```json
{
  "type": "object",
  "properties": {
    "publisher_id": {
      "type": "string"
    },
    "page": {
      "type": "number"
    },
    "size": {
      "type": "number"
    }
  },
  "required": [
    "publisher_id"
  ]
}
```

### `domain.ciq.publishers.search`

- **Scope:** `manage.read`
- **Dry-run supported:** no
- **Description:** Search publishers with filters

**Params schema**
```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string"
    },
    "filters": {
      "type": "object"
    }
  }
}
```

### `domain.ciq.pubsub.list`

- **Scope:** `manage.read`
- **Dry-run supported:** no
- **Description:** List all webhook subscriptions

**Params schema**
```json
{
  "type": "object",
  "properties": {}
}
```

### `domain.ciq.pubsub.subscribe`

- **Scope:** `manage.domain`
- **Dry-run supported:** yes
- **Description:** Subscribe to a webhook event

**Params schema**
```json
{
  "type": "object",
  "properties": {
    "entity_type": {
      "type": "string"
    },
    "action_type": {
      "type": "string"
    },
    "callback": {
      "type": "string"
    },
    "entity_id": {
      "type": "number"
    }
  },
  "required": [
    "entity_type",
    "action_type",
    "callback"
  ]
}
```

### `domain.ciq.pubsub.unsubscribe`

- **Scope:** `manage.domain`
- **Dry-run supported:** yes
- **Description:** Unsubscribe from a webhook event

**Params schema**
```json
{
  "type": "object",
  "properties": {
    "entity_type": {
      "type": "string"
    },
    "action_type": {
      "type": "string"
    }
  },
  "required": [
    "entity_type",
    "action_type"
  ]
}
```

### `domain.ciq.reports.view.run`

- **Scope:** `manage.read`
- **Dry-run supported:** no
- **Description:** Start an async report view run

**Params schema**
```json
{
  "type": "object",
  "properties": {
    "view": {
      "type": "string"
    },
    "section": {
      "type": "string"
    },
    "requestData": {
      "type": "object"
    }
  },
  "required": [
    "view",
    "requestData"
  ]
}
```

### `domain.ciq.transactions.history`

- **Scope:** `manage.read`
- **Dry-run supported:** no
- **Description:** Get ecommerce transaction history

**Params schema**
```json
{
  "type": "object",
  "properties": {
    "publisher_id": {
      "type": "string"
    },
    "campaign_id": {
      "type": "string"
    },
    "date_from": {
      "type": "string"
    },
    "date_to": {
      "type": "string"
    },
    "page": {
      "type": "number"
    },
    "page_size": {
      "type": "number"
    },
    "order_id": {
      "type": "string"
    },
    "status": {
      "type": "string"
    }
  }
}
```

### `domain.ciq.workflows.create`

- **Scope:** `manage.domain`
- **Dry-run supported:** yes
- **Description:** [PLANNED] Create a new workflow — not yet implemented

**Params schema**
```json
{
  "type": "object",
  "properties": {
    "name": {
      "type": "string"
    },
    "description": {
      "type": "string"
    },
    "steps": {
      "type": "array"
    }
  },
  "required": [
    "name",
    "steps"
  ]
}
```

### `domain.ciq.workflows.get`

- **Scope:** `manage.read`
- **Dry-run supported:** no
- **Description:** [PLANNED] Get a single workflow — not yet implemented

**Params schema**
```json
{
  "type": "object",
  "properties": {
    "workflow_id": {
      "type": "string"
    }
  },
  "required": [
    "workflow_id"
  ]
}
```

### `domain.ciq.workflows.list`

- **Scope:** `manage.read`
- **Dry-run supported:** no
- **Description:** [PLANNED] List all workflows — not yet implemented

**Params schema**
```json
{
  "type": "object",
  "properties": {
    "page": {
      "type": "number"
    },
    "size": {
      "type": "number"
    }
  }
}
```

### `domain.ciq.workflows.run`

- **Scope:** `manage.domain`
- **Dry-run supported:** yes
- **Description:** [PLANNED] Run a workflow — not yet implemented

**Params schema**
```json
{
  "type": "object",
  "properties": {
    "workflow_id": {
      "type": "string"
    },
    "input": {
      "type": "object"
    }
  },
  "required": [
    "workflow_id"
  ]
}
```

## iam.keys

### `iam.keys.create`

- **Scope:** `manage.iam`
- **Dry-run supported:** yes
- **Description:** Create a new API key

**Params schema**
```json
{
  "type": "object",
  "properties": {
    "name": {
      "type": "string"
    },
    "scopes": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "expires_at": {
      "type": "string"
    }
  },
  "required": [
    "scopes"
  ]
}
```

### `iam.keys.list`

- **Scope:** `manage.read`
- **Dry-run supported:** no
- **Description:** List all API keys for the tenant

**Params schema**
```json
{
  "type": "object",
  "properties": {}
}
```

### `iam.keys.revoke`

- **Scope:** `manage.iam`
- **Dry-run supported:** yes
- **Description:** Revoke an API key

**Params schema**
```json
{
  "type": "object",
  "properties": {
    "key_id": {
      "type": "string"
    }
  },
  "required": [
    "key_id"
  ]
}
```

### `iam.keys.update`

- **Scope:** `manage.iam`
- **Dry-run supported:** yes
- **Description:** Update an existing API key

**Params schema**
```json
{
  "type": "object",
  "properties": {
    "key_id": {
      "type": "string"
    },
    "name": {
      "type": "string"
    },
    "scopes": {
      "type": "array",
      "items": {
        "type": "string"
      }
    }
  },
  "required": [
    "key_id"
  ]
}
```

## iam.team

### `iam.team.invite`

- **Scope:** `manage.iam`
- **Dry-run supported:** yes
- **Description:** Invite a team member

**Params schema**
```json
{
  "type": "object",
  "properties": {
    "email": {
      "type": "string"
    },
    "role": {
      "type": "string"
    }
  },
  "required": [
    "email",
    "role"
  ]
}
```

### `iam.team.list`

- **Scope:** `manage.read`
- **Dry-run supported:** no
- **Description:** List all team members

**Params schema**
```json
{
  "type": "object",
  "properties": {}
}
```

## meta.actions

### `meta.actions`

- **Scope:** `manage.read`
- **Dry-run supported:** no
- **Description:** List all available actions with schemas and required scopes

**Params schema**
```json
{
  "type": "object",
  "properties": {}
}
```

## meta.version

### `meta.version`

- **Scope:** `manage.read`
- **Dry-run supported:** no
- **Description:** Get API version and schema information

**Params schema**
```json
{
  "type": "object",
  "properties": {}
}
```

## settings.get

### `settings.get`

- **Scope:** `manage.read`
- **Dry-run supported:** no
- **Description:** Get tenant settings

**Params schema**
```json
{
  "type": "object",
  "properties": {}
}
```

## settings.update

### `settings.update`

- **Scope:** `manage.settings`
- **Dry-run supported:** yes
- **Description:** Update tenant settings

**Params schema**
```json
{
  "type": "object",
  "properties": {
    "settings": {
      "type": "object"
    }
  },
  "required": [
    "settings"
  ]
}
```

## webhooks.create

### `webhooks.create`

- **Scope:** `manage.webhooks`
- **Dry-run supported:** yes
- **Description:** Create a new webhook

**Params schema**
```json
{
  "type": "object",
  "properties": {
    "url": {
      "type": "string"
    },
    "events": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "secret": {
      "type": "string"
    }
  },
  "required": [
    "url",
    "events"
  ]
}
```

## webhooks.delete

### `webhooks.delete`

- **Scope:** `manage.webhooks`
- **Dry-run supported:** yes
- **Description:** Delete a webhook

**Params schema**
```json
{
  "type": "object",
  "properties": {
    "webhook_id": {
      "type": "string"
    }
  },
  "required": [
    "webhook_id"
  ]
}
```

## webhooks.deliveries

### `webhooks.deliveries`

- **Scope:** `manage.read`
- **Dry-run supported:** no
- **Description:** List webhook deliveries

**Params schema**
```json
{
  "type": "object",
  "properties": {
    "webhook_id": {
      "type": "string"
    },
    "limit": {
      "type": "number"
    }
  },
  "required": [
    "webhook_id"
  ]
}
```

## webhooks.list

### `webhooks.list`

- **Scope:** `manage.read`
- **Dry-run supported:** no
- **Description:** List all webhooks

**Params schema**
```json
{
  "type": "object",
  "properties": {}
}
```

## webhooks.test

### `webhooks.test`

- **Scope:** `manage.webhooks`
- **Dry-run supported:** no
- **Description:** Send a test event

**Params schema**
```json
{
  "type": "object",
  "properties": {
    "webhook_id": {
      "type": "string"
    }
  },
  "required": [
    "webhook_id"
  ]
}
```

## webhooks.update

### `webhooks.update`

- **Scope:** `manage.webhooks`
- **Dry-run supported:** yes
- **Description:** Update a webhook

**Params schema**
```json
{
  "type": "object",
  "properties": {
    "webhook_id": {
      "type": "string"
    },
    "url": {
      "type": "string"
    },
    "events": {
      "type": "array"
    },
    "active": {
      "type": "boolean"
    }
  },
  "required": [
    "webhook_id"
  ]
}
```
