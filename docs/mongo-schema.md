# MongoDB Schema Reference

> Auto-maintained reference for all Mongoose collections, fields, and indexes.
> Source of truth: `src/server/models/*.ts`

---

## Collections

### 1. `organizations`

Model: `Organization` — `src/server/models/Organization.ts`

| Field       | Type     | Required | Default | Notes              |
|-------------|----------|----------|---------|--------------------|
| `_id`       | ObjectId | auto     |         |                    |
| `name`      | String   | yes      |         |                    |
| `createdBy` | String   | yes      |         | Firebase UID       |
| `createdAt` | Date     | auto     |         | Mongoose timestamp |
| `updatedAt` | Date     | auto     |         | Mongoose timestamp |

**Indexes:**
| Fields | Type    | Source         |
|--------|---------|----------------|
| `_id`  | Primary | MongoDB default |

---

### 2. `users`

Model: `User` — `src/server/models/User.ts`

| Field         | Type     | Required | Default    | Notes                            |
|---------------|----------|----------|------------|----------------------------------|
| `_id`         | ObjectId | auto     |            |                                  |
| `firebaseUid` | String   | yes      |            | **unique**                       |
| `email`       | String   | yes      |            |                                  |
| `displayName` | String   | yes      |            |                                  |
| `orgId`       | ObjectId | yes      |            | Ref → `Organization`            |
| `role`        | String   | no       | `"viewer"` | Enum: `admin`, `viewer`          |
| `invitedBy`   | ObjectId | no       |            | Ref → `User`                    |
| `createdAt`   | Date     | auto     |            | Mongoose timestamp               |
| `updatedAt`   | Date     | auto     |            | Mongoose timestamp               |

**Indexes:**
| Fields        | Type    | Source              |
|---------------|---------|---------------------|
| `_id`         | Primary | MongoDB default     |
| `firebaseUid` | Unique  | Schema `unique: true` |

---

### 3. `invites`

Model: `Invite` — `src/server/models/Invite.ts`

| Field       | Type     | Required | Default     | Notes                                 |
|-------------|----------|----------|-------------|---------------------------------------|
| `_id`       | ObjectId | auto     |             |                                       |
| `email`     | String   | yes      |             |                                       |
| `orgId`     | ObjectId | yes      |             | Ref → `Organization`                 |
| `role`      | String   | no       | `"viewer"`  | Enum: `admin`, `viewer`               |
| `invitedBy` | ObjectId | yes      |             | Ref → `User`                         |
| `status`    | String   | no       | `"pending"` | Enum: `pending`, `accepted`, `expired`|
| `createdAt` | Date     | auto     |             | Mongoose timestamp                    |
| `updatedAt` | Date     | auto     |             | Mongoose timestamp                    |

**Indexes:**
| Fields | Type    | Source         |
|--------|---------|----------------|
| `_id`  | Primary | MongoDB default |

---

### 4. `agents`

Model: `Agent` — `src/server/models/Agent.ts`

| Field        | Type     | Required | Default | Notes              |
|--------------|----------|----------|---------|--------------------|
| `_id`        | ObjectId | auto     |         |                    |
| `orgId`      | ObjectId | yes      |         | Ref → `Organization` |
| `name`       | String   | yes      |         |                    |
| `url`        | String   | yes      |         | Agent frontend URL |
| `apiBaseUrl` | String   | yes      |         | Agent API base URL |
| `backendUrl` | String   | no       | `""`    | Agent backend URL  |
| `username`   | String   | yes      |         |                    |
| `password`   | String   | yes      |         | Stored in plain text |
| `createdAt`  | Date     | auto     |         | Mongoose timestamp |
| `updatedAt`  | Date     | auto     |         | Mongoose timestamp |

**Indexes:**
| Fields | Type    | Source         |
|--------|---------|----------------|
| `_id`  | Primary | MongoDB default |

---

### 5. `goldensets`

Model: `GoldenSet` — `src/server/models/GoldenSet.ts`

| Field          | Type     | Required | Default | Notes                          |
|----------------|----------|----------|---------|--------------------------------|
| `_id`          | ObjectId | auto     |         |                                |
| `orgId`        | ObjectId | yes      |         | Ref → `Organization`          |
| `name`         | String   | yes      |         |                                |
| `description`  | String   | no       |         |                                |
| `entries`      | Array    | yes      |         | Embedded `GoldenSetEntry` docs |
| `sourceFormat` | String   | yes      |         | Enum: `csv`, `json`, `xlsx`    |
| `createdAt`    | Date     | auto     |         | Mongoose timestamp             |
| `updatedAt`    | Date     | auto     |         | Mongoose timestamp             |

**Embedded: `GoldenSetEntry`** (no `_id`)

| Field              | Type   | Required |
|--------------------|--------|----------|
| `question`         | String | yes      |
| `expectedAnswer`   | String | yes      |
| `language`         | String | yes      |
| `category`         | String | no       |
| `topic`            | String | no       |
| `expectedArticles` | [String] | no     |

**Indexes:**
| Fields | Type    | Source         |
|--------|---------|----------------|
| `_id`  | Primary | MongoDB default |

---

### 6. `evaluationruns`

Model: `EvaluationRun` — `src/server/models/EvaluationRun.ts`

| Field           | Type     | Required | Default     | Notes                                            |
|-----------------|----------|----------|-------------|--------------------------------------------------|
| `_id`           | ObjectId | auto     |             |                                                  |
| `orgId`         | ObjectId | yes      |             | Ref → `Organization`                            |
| `goldenSetId`   | ObjectId | yes      |             | Ref → `GoldenSet`                               |
| `goldenSetName` | String   | yes      |             | Denormalized name                                |
| `agentId`       | ObjectId | yes      |             | Ref → `Agent`                                   |
| `agentName`     | String   | yes      |             | Denormalized name                                |
| `status`        | String   | no       | `"pending"` | Enum: `pending`, `running`, `completed`, `failed`|
| `progress`      | Number   | no       | `0`         | 0–100                                            |
| `judgeModel`    | String   | yes      |             | e.g. `claude-sonnet-4-20250514`               |
| `scoreProfileId`| ObjectId | no       |             | Ref → `ScoreProfile`; when absent, the org's default profile applies |
| `startedAt`     | Date     | no       |             |                                                  |
| `completedAt`   | Date     | no       |             |                                                  |
| `error`         | String   | no       |             | Error message if status=failed                   |
| `playwrightLog` | [String] | no       | `[]`        | Line-by-line Playwright log                      |
| `summary`       | Object   | no       |             | Embedded `RunSummary`                            |
| `createdAt`     | Date     | auto     |             | Mongoose timestamp                               |
| `updatedAt`     | Date     | auto     |             | Mongoose timestamp                               |

**Embedded: `RunSummary`** (no `_id`)

| Field              | Type   | Default |
|--------------------|--------|---------|
| `totalQuestions`   | Number | `0`     |
| `completedQuestions` | Number | `0`   |
| `avgCorrectness`  | Number | `0`     |
| `avgCompleteness`  | Number | `0`     |
| `avgRelevance`     | Number | `0`     |
| `avgFaithfulness`  | Number | `0`     |
| `avgOverallScore`  | Number | `0`     |
| `byLanguage`       | Mixed  | `{}`    |

**Indexes:**
| Fields | Type    | Source         |
|--------|---------|----------------|
| `_id`  | Primary | MongoDB default |

---

### 7. `evaluationresults`

Model: `EvaluationResult` — `src/server/models/EvaluationResult.ts`

| Field              | Type     | Required | Default      | Notes                                             |
|--------------------|----------|----------|--------------|---------------------------------------------------|
| `_id`              | ObjectId | auto     |              |                                                   |
| `orgId`            | ObjectId | yes      |              | Ref → `Organization`                             |
| `runId`            | ObjectId | yes      |              | Ref → `EvaluationRun`, **indexed**               |
| `entryIndex`       | Number   | yes      |              | Position in golden set                            |
| `question`         | String   | yes      |              |                                                   |
| `expectedAnswer`   | String   | yes      |              |                                                   |
| `actualAnswer`     | String   | yes      |              | Agent response (or error text for error results)  |
| `language`         | String   | yes      |              |                                                   |
| `category`         | String   | no       |              |                                                   |
| `topic`            | String   | no       |              |                                                   |
| `resultType`       | String   | no       | `"scored"`   | Enum: `scored`, `knowledge_gap`, `error`          |
| `errorMessage`     | String   | no       |              | Set when `resultType = "error"`                   |
| `judgeScores`      | Object   | no       |              | Embedded `JudgeScores`; absent for error results  |
| `searchKnowledge`  | Object   | no       | `{queries:[], chunks:[]}` | Embedded `SearchKnowledge`         |
| `retrievedArticles`| Array    | no       | `[]`         | Legacy; deprecated in favor of `searchKnowledge`  |
| `responseTimeMs`   | Number   | yes      |              | Playwright elapsed time (not agent response time) |
| `rawApiResponses`  | [Mixed]  | no       |              | Excluded from queries via `.select()`             |
| `createdAt`        | Date     | auto     |              | Mongoose timestamp                                |
| `updatedAt`        | Date     | auto     |              | Mongoose timestamp                                |

**Embedded: `JudgeScores`** (no `_id`)

| Field              | Type    | Required | Notes                       |
|--------------------|---------|----------|-----------------------------|
| `correctness`      | Object  | yes      | `{ score: 1-5, explanation }` |
| `completeness`     | Object  | yes      | `{ score: 1-5, explanation }` |
| `relevance`        | Object  | yes      | `{ score: 1-5, explanation }` |
| `faithfulness`     | Object  | yes      | `{ score: 1-5, explanation }` |
| `knowledgeQuality` | Object  | no       | Embedded `KnowledgeQuality`   |
| `overallScore`     | Number  | yes      | Weighted average of 4 scores  |
| `detectedLanguage` | String  | yes      | Language detected by judge    |
| `languageMatch`    | Boolean | yes      | Does response match expected language |

**Embedded: `KnowledgeQuality`** (no `_id`)

| Field          | Type     | Default | Notes                              |
|----------------|----------|---------|------------------------------------|
| `score`        | Number   | `0`     | 1-5; ≤2 triggers `knowledge_gap`  |
| `explanation`  | String   | `""`    |                                    |
| `gaps`         | [String] | `[]`    | Missing knowledge topics           |
| `improvements` | [String] | `[]`    | Suggested article improvements     |

**Embedded: `SearchKnowledge`** (no `_id`)

| Field    | Type     | Default |
|----------|----------|---------|
| `queries`| [String] | `[]`    |
| `chunks` | Array    | `[]`    |

**Embedded: `RetrievedChunk`** (within `SearchKnowledge.chunks`, no `_id`)

| Field     | Type   | Required |
|-----------|--------|----------|
| `chunkId` | String | yes      |
| `title`   | String | yes      |
| `content` | String | yes      |
| `url`     | String | no       |
| `score`   | Number | no       |

**Indexes:**
| Fields  | Type      | Source                 |
|---------|-----------|------------------------|
| `_id`   | Primary   | MongoDB default        |
| `runId` | Secondary | Schema `index: true`   |

---

### 8. `scoreprofiles`

Model: `ScoreProfile` — `src/server/models/ScoreProfile.ts`

Named profiles that control which criteria contribute to the "overall" score displayed in the UI. Score calculation happens on the fly from stored per-criterion scores — editing a profile changes displayed numbers but never mutates `judgeScores` or `summary` in Mongo.

| Field             | Type     | Required | Default                                                | Notes                                                            |
|-------------------|----------|----------|--------------------------------------------------------|------------------------------------------------------------------|
| `_id`             | ObjectId | auto     |                                                        |                                                                  |
| `orgId`           | ObjectId | yes      |                                                        | Ref → `Organization`                                            |
| `name`            | String   | yes      |                                                        | Trimmed; unique per org                                          |
| `enabledCriteria` | [String] | no       | `["correctness", "completeness", "relevance"]`        | Subset of `correctness`, `completeness`, `relevance`, `faithfulness` |
| `isDefault`       | Boolean  | no       | `false`                                                | At most one per org                                              |
| `createdAt`       | Date     | auto     |                                                        | Mongoose timestamp                                               |
| `updatedAt`       | Date     | auto     |                                                        | Mongoose timestamp                                               |

**Seeding:** On first `GET /score-profiles` call (or run-page fetch) for an org, a "Without Faithfulness" profile with `enabledCriteria: ["correctness", "completeness", "relevance"]` and `isDefault: true` is auto-created.

**Indexes:**
| Fields              | Type    | Source                                    |
|---------------------|---------|-------------------------------------------|
| `_id`               | Primary | MongoDB default                           |
| `orgId + name`      | Unique  | Schema `index({ orgId, name }, unique)`   |
| `orgId + isDefault` | Compound| Schema `index({ orgId, isDefault })`      |

---

## Index Summary (all collections)

| Collection          | Field(s)       | Type      | Declared In           |
|---------------------|----------------|-----------|-----------------------|
| `organizations`     | `_id`          | Primary   | MongoDB default       |
| `users`             | `_id`          | Primary   | MongoDB default       |
| `users`             | `firebaseUid`  | Unique    | Schema `unique: true` |
| `invites`           | `_id`          | Primary   | MongoDB default       |
| `agents`            | `_id`          | Primary   | MongoDB default       |
| `goldensets`        | `_id`          | Primary   | MongoDB default       |
| `evaluationruns`    | `_id`          | Primary   | MongoDB default       |
| `evaluationresults` | `_id`          | Primary   | MongoDB default       |
| `evaluationresults` | `runId`        | Secondary | Schema `index: true`  |
| `scoreprofiles`     | `_id`          | Primary   | MongoDB default       |
| `scoreprofiles`     | `orgId + name` | Unique    | Schema compound index |
| `scoreprofiles`     | `orgId + isDefault` | Compound | Schema compound index |

---

## Schema Changelog

| Date       | Collection          | Change                                                                 |
|------------|---------------------|------------------------------------------------------------------------|
| 2026-04-16 | `evaluationresults` | Added `resultType` (enum: scored/knowledge_gap/error, default: scored) |
| 2026-04-16 | `evaluationresults` | Added `errorMessage` (optional String)                                 |
| 2026-04-16 | `evaluationresults` | Changed `judgeScores` from required to optional                        |
| 2026-04-16 | `evaluationresults` | Added embedded `knowledgeQuality` sub-doc inside `judgeScores`         |
| 2026-04-16 | `scoreprofiles`     | New collection: named score-criteria profiles (org-scoped)             |
| 2026-04-16 | `evaluationruns`    | Added `scoreProfileId` (optional Ref → ScoreProfile)                  |
