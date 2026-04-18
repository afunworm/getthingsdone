# FlowTask REST API

External programs can interact with FlowTask through this REST API using long-lived API tokens.

## Base URL

```
http://your-server:3000/api/v1
```

Replace `your-server:3000` with wherever FlowTask is hosted.

---

## Authentication

All requests require a token in the `Authorization` header:

```
Authorization: Bearer gtd_<your_token>
```

Tokens are created by an admin in **Admin → Settings → API Tokens**. A token can be set to expire after a fixed number of days or never expire. The raw token is only shown once at creation — store it securely.

### Example

```bash
curl https://your-server/api/v1/whoami \
  -H "Authorization: Bearer gtd_a1b2c3d4..."
```

---

## Errors

| Status | Meaning                                        |
| ------ | ---------------------------------------------- |
| `401`  | Missing, invalid, or expired token             |
| `403`  | Token owner lacks permission for that resource |
| `404`  | Resource not found                             |
| `204`  | Success with no body (DELETE)                  |

Error responses follow this shape:

```json
{
  "statusCode": 404,
  "message": "Not Found"
}
```

---

## Endpoints

### `GET /api/v1/whoami`

Returns information about the token owner.

```bash
curl https://your-server/api/v1/whoami \
  -H "Authorization: Bearer gtd_..."
```

**Response**

```json
{
  "id": "usr_abc123",
  "name": "Alice",
  "email": "alice@example.com",
  "role": "admin"
}
```

---

### `GET /api/v1/projects`

Lists all projects (team inboxes) accessible to the token owner. Admins see all projects; regular users see only projects they are a member of.

```bash
curl https://your-server/api/v1/projects \
  -H "Authorization: Bearer gtd_..."
```

**Response**

```json
[
  {
    "id": "proj_abc123",
    "name": "Engineering",
    "description": "Engineering team tasks",
    "color": "#6750a4",
    "emoji": "⚙️",
    "flow_steps": ["Backlog", "In Progress", "Review", "Done"],
    "owner_name": "Alice"
  }
]
```

Use the `id` values here as `project_id` when creating or listing tasks.

---

## Tasks

### `GET /api/v1/tasks`

Lists tasks. Defaults to the token owner's **personal inbox** when no `project_id` is given.

**Query parameters**

| Param        | Type    | Description                                                     |
| ------------ | ------- | --------------------------------------------------------------- |
| `project_id` | string  | List tasks from this team inbox                                 |
| `status`     | integer | Filter by flow step index (e.g. `0` = first step, `1` = second) |
| `priority`   | integer | Filter by priority: `0` none, `1` low, `2` medium, `3` urgent   |

**List personal inbox**

```bash
curl "https://your-server/api/v1/tasks" \
  -H "Authorization: Bearer gtd_..."
```

**List tasks in a project, only in-progress and urgent**

```bash
curl "https://your-server/api/v1/tasks?project_id=proj_abc123&status=1&priority=3" \
  -H "Authorization: Bearer gtd_..."
```

**Response**

```json
[
  {
    "id": "todo_xyz789",
    "title": "Fix login bug",
    "description": "Users can't log in with SSO",
    "flow_step_index": 1,
    "priority": 3,
    "due_date": 1746057600,
    "is_recurring": false,
    "recurrence_rule": null,
    "project_id": "proj_abc123",
    "is_inbox": false,
    "sort_order": 0,
    "created_by": "usr_abc123",
    "created_by_name": "Alice",
    "created_at": 1745884800,
    "updated_at": 1745884800,
    "assignees": {
      "users": [{ "id": "usr_def456", "name": "Bob" }],
      "teams": []
    },
    "subtodos": []
  }
]
```

> **Note on `due_date`:** All timestamps are Unix seconds (seconds since 1970-01-01 UTC).

---

### `GET /api/v1/tasks/:id`

Returns a single task by ID.

```bash
curl "https://your-server/api/v1/tasks/todo_xyz789" \
  -H "Authorization: Bearer gtd_..."
```

**Response** — same shape as a single item from the list above.

---

### `POST /api/v1/tasks`

Creates a new task. Supports both `application/json` and `multipart/form-data`. Use multipart when attaching a file; use JSON for text-only tasks.

**Fields**

| Field         | Type    | Required | Description                                         |
| ------------- | ------- | -------- | --------------------------------------------------- |
| `title`       | string  | Yes      | Task title                                          |
| `description` | string  | No       | Longer description                                  |
| `project_id`  | string  | No       | Team inbox ID. Omit to create in the personal inbox |
| `due_date`    | integer | No       | Unix timestamp (seconds)                            |
| `priority`    | integer | No       | `0` none · `1` low · `2` medium · `3` urgent        |
| `sort_order`  | integer | No       | Position hint within the list (lower = higher up)   |
| `files`       | file(s) | No       | Attachments — multipart/form-data only. Up to 10 files, 25 MB each. Use the same field name `files` for every file. |

**Create a task in the personal inbox (JSON)**

```bash
curl -X POST "https://your-server/api/v1/tasks" \
  -H "Authorization: Bearer gtd_..." \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Buy coffee beans",
    "due_date": 1746144000
  }'
```

**Create an urgent task in a project (JSON)**

```bash
curl -X POST "https://your-server/api/v1/tasks" \
  -H "Authorization: Bearer gtd_..." \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Fix login bug",
    "description": "Users cannot log in with SSO on Firefox",
    "project_id": "proj_abc123",
    "due_date": 1746057600,
    "priority": 3
  }'
```

**Create a task with file attachments (multipart/form-data)**

```bash
# Single file
curl -X POST "https://your-server/api/v1/tasks" \
  -H "Authorization: Bearer gtd_..." \
  -F "title=Support ticket #4821" \
  -F "description=See attached screenshot" \
  -F "project_id=proj_abc123" \
  -F "priority=2" \
  -F "files=@/path/to/screenshot.png"

# Multiple files — repeat the `files` field
curl -X POST "https://your-server/api/v1/tasks" \
  -H "Authorization: Bearer gtd_..." \
  -F "title=Support ticket #4821" \
  -F "project_id=proj_abc123" \
  -F "files=@/path/to/screenshot.png" \
  -F "files=@/path/to/log.txt"
```

**Response** — `201 Created`, returns the created task object. When a file is attached, an `attachments` array is included:

```json
{
  "id": "todo_xyz789",
  "title": "Support ticket #4821",
  "attachments": [
    {
      "id": "att_abc123",
      "filename": "screenshot.png",
      "url": "/uploads/3f8a1c2d.png",
      "size": 142300
    }
  ]
}
```

---

### `PATCH /api/v1/tasks/:id`

Updates one or more fields on an existing task. Only fields present in the body are changed.

**Body fields**

| Field             | Type            | Description                          |
| ----------------- | --------------- | ------------------------------------ |
| `title`           | string          | New title                            |
| `description`     | string          | New description (send `""` to clear) |
| `due_date`        | integer \| null | Unix timestamp, or `null` to remove  |
| `priority`        | integer         | `0`–`3`                              |
| `flow_step_index` | integer         | Move to a specific step (0-based)    |
| `project_id`      | string          | Move task to a different team inbox  |
| `sort_order`      | integer         | Reposition within the list           |

**Mark a task as done (set to last step)**

```bash
curl -X PATCH "https://your-server/api/v1/tasks/todo_xyz789" \
  -H "Authorization: Bearer gtd_..." \
  -H "Content-Type: application/json" \
  -d '{ "flow_step_index": 3 }'
```

**Change priority and clear due date**

```bash
curl -X PATCH "https://your-server/api/v1/tasks/todo_xyz789" \
  -H "Authorization: Bearer gtd_..." \
  -H "Content-Type: application/json" \
  -d '{
    "priority": 1,
    "due_date": null
  }'
```

**Response** — returns the updated task object.

---

### `POST /api/v1/tasks/:id/attachments`

Adds one or more files to an existing task. Use this when you need to attach files after the task has already been created.

Accepts `multipart/form-data` only. Use `files` as the field name, repeated for each file. Up to 10 files, 25 MB each.

```bash
# Attach a single file
curl -X POST "https://your-server/api/v1/tasks/todo_xyz789/attachments" \
  -H "Authorization: Bearer gtd_..." \
  -F "files=@/path/to/report.pdf"

# Attach multiple files
curl -X POST "https://your-server/api/v1/tasks/todo_xyz789/attachments" \
  -H "Authorization: Bearer gtd_..." \
  -F "files=@/path/to/report.pdf" \
  -F "files=@/path/to/screenshot.png"
```

**Response** — `201 Created`

```json
{
  "attachments": [
    { "id": "att_abc123", "filename": "report.pdf", "url": "/uploads/3f8a1c2d.pdf", "size": 204800 },
    { "id": "att_def456", "filename": "screenshot.png", "url": "/uploads/9a1b2c3d.png", "size": 142300 }
  ]
}
```

---

### `DELETE /api/v1/tasks/:id`

Permanently deletes a task and all its subtasks.

```bash
curl -X DELETE "https://your-server/api/v1/tasks/todo_xyz789" \
  -H "Authorization: Bearer gtd_..."
```

**Response** — `204 No Content` on success.

---

## Working with `flow_step_index`

Steps are zero-indexed based on the project's `flow_steps` array. For the personal inbox, the steps are always:

| Index | Label       |
| ----- | ----------- |
| `0`   | New         |
| `1`   | In Progress |
| `2`   | Done        |

For team inboxes, check the `flow_steps` array in `GET /api/v1/projects`. For example, if `flow_steps` is `["Backlog", "In Progress", "Review", "Done"]` then `flow_step_index: 2` means "Review".

---

## Working with `due_date`

All timestamps are **Unix seconds**. To convert:

```python
# Python
import time, datetime

# Current time as Unix seconds
now = int(time.time())

# Specific date → Unix seconds
due = int(datetime.datetime(2025, 5, 1, 9, 0, 0).timestamp())

# Unix seconds → readable date
readable = datetime.datetime.fromtimestamp(1746057600).isoformat()
```

```javascript
// JavaScript / Node.js

// Specific date → Unix seconds
const due = Math.floor(new Date('2025-05-01T09:00:00').getTime() / 1000);

// Unix seconds → readable date
const readable = new Date(1746057600 * 1000).toISOString();
```

```bash
# Shell
date -d "2025-05-01 09:00:00" +%s   # Linux
date -j -f "%Y-%m-%d" "2025-05-01" +%s  # macOS
```

---

## Python example

```python
import requests

BASE = "https://your-server/api/v1"
TOKEN = "gtd_your_token_here"
HEADERS = {"Authorization": f"Bearer {TOKEN}"}

# List urgent tasks across personal inbox
tasks = requests.get(f"{BASE}/tasks", headers=HEADERS, params={"priority": 3}).json()
for t in tasks:
    print(t["title"], t["due_date"])

# Create a task (JSON)
new_task = requests.post(f"{BASE}/tasks", headers=HEADERS, json={
    "title": "Automated task from script",
    "priority": 2,
    "due_date": 1746144000,
}).json()
print("Created:", new_task["id"])

# Create a task with file attachments (multipart/form-data)
# For multiple files, pass a list of tuples under the same field name "files"
with open("/path/to/report.pdf", "rb") as f1, open("/path/to/screenshot.png", "rb") as f2:
    task_with_files = requests.post(
        f"{BASE}/tasks",
        headers=HEADERS,
        data={
            "title": "Support ticket with attachments",
            "project_id": "proj_abc123",
            "priority": "2",
        },
        files=[
            ("files", ("report.pdf", f1, "application/pdf")),
            ("files", ("screenshot.png", f2, "image/png")),
        ],
    ).json()
print("Created:", task_with_files["id"], task_with_files.get("attachments"))

# Mark it done (personal inbox = step 2)
requests.patch(f"{BASE}/tasks/{new_task['id']}", headers=HEADERS, json={
    "flow_step_index": 2
})

# Delete it
requests.delete(f"{BASE}/tasks/{new_task['id']}", headers=HEADERS)
```

---

## Managing tokens (Admin)

Tokens are managed in the web UI under **Admin → Settings → API Tokens**, or via the admin API (requires a logged-in admin session, not a token):

| Method   | Path                        | Description     |
| -------- | --------------------------- | --------------- |
| `GET`    | `/api/admin/api-tokens`     | List all tokens |
| `POST`   | `/api/admin/api-tokens`     | Create a token  |
| `DELETE` | `/api/admin/api-tokens/:id` | Revoke a token  |

**Create token via API**

```bash
curl -X POST "https://your-server/api/admin/api-tokens" \
  -H "Content-Type: application/json" \
  -b "session=..." \
  -d '{
    "name": "CI Pipeline",
    "expiresAt": 1777680000
  }'
```

`expiresAt` is a Unix timestamp (seconds). Omit or send `null` for a non-expiring token.

**Response** — the token value is returned **once** in the `token` field and never stored in plain text:

```json
{
  "id": "tok_abc123",
  "name": "CI Pipeline",
  "expires_at": 1777680000,
  "created_at": 1745884800,
  "last_used_at": null,
  "created_by_name": "Alice",
  "token": "gtd_a1b2c3d4e5f6..."
}
```
