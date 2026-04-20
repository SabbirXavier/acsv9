# Security Specification: Advanced Classes Study Hub

## Data Invariants
1. **Identity Integrity**: No user can impersonate another. Fields like `userId`, `senderId`, `uid` must match `request.auth.uid`.
2. **PII Protection**: Enrollments and User profiles containing sensitive data must not be publicly readable via blanket queries.
3. **Admin Exclusivity**: All configuration (branding, landing, channels_config) and critical data (batches, routines, fees) can only be modified by specific admin emails or users with the `admin` role.
4. **Relational Consistency**: A message cannot be created in a channel the user does not have 'view' permission for (according to `channels_config`).
5. **Terminal State**: Once an enrollment is 'active', only an admin should be able to move it back to 'pending' or 'suspended' (hypothetical terminal state check).
6. **Immortality**: `createdAt` timestamps and `originalOwnerId` (if used) are immutable after creation.

## The "Dirty Dozen" Payloads (Attack Vectors)

| ID | Attack Type | Target Path | Payload | Expected Result |
|----|-------------|-------------|---------|-----------------|
| D1 | Identity Spoofing | `/users/victim_uid` | `{ "name": "Attacker", "role": "admin" }` | **PERMISSION_DENIED** (Not owner) |
| D2 | Privilege Escalation | `/users/my_uid` | `{ "role": "admin" }` | **PERMISSION_DENIED** (Cannot change own role to admin) |
| D3 | PII Harvesting | `/enrollments` | `db.collection('enrollments').get()` | **PERMISSION_DENIED** (Blanket list denied) |
| D4 | Resource Poisoning | `/batches/b1` | `{ "name": "X".repeat(10000) }` | **PERMISSION_DENIED** (String too long) |
| D5 | Shadow Update | `/admin/branding` | `{ "title": "New", "isVerified": true }` | **PERMISSION_DENIED** (Extra key 'isVerified') |
| D6 | Sync Bypass | `/enrollments/e1` | `{ "status": "active" }` | **PERMISSION_DENIED** (Non-admin cannot activate) |
| D7 | Orphaned Write | `/channels/invalid_id/messages/m1` | `{ "content": "hi", "senderId": "me" }` | **PERMISSION_DENIED** (Channel doesn't exist) |
| D8 | Timestamp Fraud | `/drops/d1` | `{ "createdAt": "2020-01-01T00:00:00Z" }` | **PERMISSION_DENIED** (Must use server timestamp) |
| D9 | Ghost Deletion | `/achievers/a1` | `delete` | **PERMISSION_DENIED** (Not admin) |
| D10 | System Key Leak | `/admin/storage/projects/p1` | `{ "maxCapacityBytes": 9999999999 }` | **PERMISSION_DENIED** (Unauthorized quota change) |
| D11 | Query Scraping | `/users` | `where("role", "==", "admin")` | **PERMISSION_DENIED** (Unauthorized list) |
| D12 | Injection Attack | `/channels/$(payload)/messages` | `{ "id": "javascript:alert(1)" }` | **PERMISSION_DENIED** (Invalid ID chars) |

## Hardened Rule Implementation Plan
- Use `isValidId()` for all document IDs.
- Use `hasOnlyAllowedFields()` on all writes.
- Enforce `request.time` for all timestamps.
- Restrict `enrollments` read to `admin` or specific `isOwnerByEmail`.
- Default deny everything at the root.
