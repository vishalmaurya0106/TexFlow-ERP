# Security Summary

**Reviewed Files**: 23
**Issues Resolved**: 10

### Issues Resolved
| Area | File | Line | What Was Happening | Impact | Status | How It Was Fixed |
|---|---|---|---|---|---|---|
| Open Firestore Rules & Missing Schema Validation | `firestore.rules` | 1–302 | All collections lacked strict field allowlists, data type/size bounds, enum checks, ID regex validation, and a default-deny fallback. | High | Fixed | Deployed hardened rules with global default-deny catch-all, strict `isValidId` regex guards, entity validation blueprints (`keys().hasOnly`), immutable primary identifiers, numeric bounds, Paid salary edit locks, and ESLint verification. |
| Concurrent Production Race Condition | `src/lib/firebase.ts` | 635–773 | Simultaneous Loom Production submissions from two devices could both pass client checks and overwrite or double-book the same operator/machine. | High | Fixed | Added `createDailyWorkAtomic` using Firestore `runTransaction` over deterministic lock documents (`daily_work_locks`) plus pre-query validation against legacy records, and transactional lock cleanup in `deleteDailyWork`. |
| Unauthenticated/Destructive Reconciliation Wipe | `src/lib/firebase.ts` | 962–1050 | Background/manual sync deleted any cloud documents absent from a device's local state, risking silent multi-user data loss across tabs or devices. | High | Fixed | Replaced destructive sync with additive `syncLocalMissingToFirebase`, which only uploads missing local records and never deletes another session's cloud records. |
| Duplicate Attendance Writes & Stale Cache Clobbering | `src/lib/firebase.ts` | 779–854 | Random timestamp IDs created duplicate attendance records when multiple staff clicked Save concurrently, and empty initial fetches could fail silently. | Medium | Fixed | Added deterministic `(date, shift, workerId)` IDs with server pre-query reuse (`saveAdminAttendanceAtomic` / `batchSaveAdminAttendances`), multi-tab Firestore IndexedDB persistence (`persistentMultipleTabManager`), and surfaced `onSnapshot` errors cleanly. |
| Paid Salary Tampering & Keystroke Race Condition | `src/components/MonthlySalarySheet.tsx` | 250–365 | Every keystroke triggered an immediate async write and allowed numeric mutations on records already marked `Paid`. | Medium | Fixed | Added debounced draft state with `onBlur` flush, transactional `Paid` lock checks on both client (`createSalary`) and server (`firestore.rules`), and read-only lock UI while `Paid`. |
| Cascade Delete Orphaned Records | `src/lib/firebase.ts` | 463–498 | Worker deletion relied only on in-memory client arrays, leaving concurrent cloud logs orphaned if created from another device. | Medium | Fixed | Replaced with `deleteWorkerCascade`, which queries Firestore directly across `daily_works`, `admin_attendances`, `attendances`, `salaries`, and `daily_work_locks`, deleting them in chunked batches. |
| Partial / Fake-Success Saves & Duplicate Submissions | `src/App.tsx`, `src/components/LoomDailyWork.tsx`, `src/components/WorkersDirectory.tsx`, `src/components/MachineRegistry.tsx`, `src/components/SettingsPanel.tsx` | Multiple | Forms cleared/closed before confirming Firebase writes, lacked double-click submission locks, and swallowed async errors. | Medium | Fixed | Awaited all Firestore writes before updating UI/closing modals, added in-flight submission and deletion locks, and replaced silent `.catch(() => {})` handlers with formatted error surfacing. |
| Blocking Browser Dialogs & Unintended Page Reloads | `src/App.tsx`, `src/components/AttendanceReportDivision.tsx`, `src/components/LoomReportsRegister.tsx`, `src/components/MonthlySalarySheet.tsx`, `src/components/WorkersDirectory.tsx` | Multiple | Used `window.alert`, `window.confirm`, and `window.location.reload()` in validation and backup flows, risking unsaved state loss. | Low | Fixed | Replaced all browser dialogs and forced reloads with inline validation banners, `ConfirmModal`, non-blocking toast notifications, and automatic safety JSON downloads before destructive resets. |
| Service Worker Intercepting Live Firestore Requests | `public/sw.js` | 1–46 | Aggressive fetch handling lacked strict GET + same-origin scoping and bumped cache version control. | Low | Fixed | Scoped cache handling strictly to same-origin `GET` requests under `texflow-v2` with `skipWaiting`/`clients.claim`, leaving all cross-origin Firestore traffic untouched. |
| Third-Party Excel Parser Package Advisory | `package.json` | 28 | Direct dependency `xlsx@0.18.5` has known upstream advisories when parsing untrusted `.xlsx` files. | Low | Needs Follow-Up | Added explicit validation and schema clamping on imported employee rows (`WorkersDirectory.tsx`); keep spreadsheet uploads restricted to trusted internal Admin spreadsheets or migrate to a maintained parser (e.g. `exceljs`) in a future maintenance window. |

### Safeguards Verified
| Area | File | How It's Protected |
|---|---|---|
| Pre-Repair Production Backup | `/.aistudio/artifacts/brain/c52d044f-8b12-47de-8dc4-52d491868547/backups/firestore_pre_repair_backup_2026-11-25T12-00-22-579Z.json` | Full verified JSON snapshot of all 3,106 live Firestore records (`companies: 2`, `workers: 84`, `machines: 30`, `daily_works: 1624`, `admin_attendances: 1364`, `attendances: 0`, `salaries: 2`, SHA-256 `68349d52b760c4122ca5fcf8858cfc5aede683c73ee0b63d9475c1536b87fa05`). |
| Database Rules & Blueprint Parity | `firebase-blueprint.json`, `firestore.rules`, `eslint.config.mjs` | Blueprint entities and Firestore rules share aligned field types, string limits, date/month regexes, enum sets, and immutable primary IDs; verified with `@firebase/eslint-plugin-security-rules` (exit code 0) and live `DeployRules`. |
| Uncaught UI & Database Fault Recovery | `src/components/ErrorBoundary.tsx`, `src/main.tsx` | Top-level `ErrorBoundary` catches runtime or structured Firestore permission errors and provides safe recovery without exposing raw stack traces. |
| Role-Based UI Action Guarding | `src/components/LoomDailyWork.tsx`, `src/components/AdminAttendanceRegister.tsx`, `src/components/OtherAttendanceRegister.tsx`, `src/components/WorkersDirectory.tsx`, `src/components/MachineRegistry.tsx` | Delete triggers and modals remain hidden/blocked for non-Admin role sessions (`Staff`, `Supervisor 1`, `Supervisor 2`), while Settings/Resets remain Admin-only. |

## PoC Verification

### Unregistered Collection & Schema Injection via Direct Firestore Write

#### Summary
| Field | Value |
|---|---|
| Issue Type | Missing Database Schema & Collection Access Controls |
| Impact | High |
| Affected File | `firestore.rules:4-189` |
| Test Scenario | Direct Firestore `setDoc` attempts containing an unknown collection (`/rogue_collection/doc1`), shadow field (`isAdmin: true`), negative wage (`calculatedWage: -50`), empty `selectedMachines: []`, malformed date (`"25/11/2026"`), and invalid status (`"SuperPresent"`). |

#### How It Was Fixed
Deployed strict default-deny catch-all rules paired with entity-level `keys().hasAll(...)` / `keys().hasOnly(...)` allowlists, type assertions, range bounds, and date/enum format checks on every collection in `firestore.rules`.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Adversarial `setDoc` requests target `/rogue_collection/doc1` and schema-violating documents in `/workers`, `/daily_works`, and `/admin_attendances`. | Requests arrive at live Firestore rules evaluator |
| 2 | `/rogue_collection/doc1` matches global `match /{document=**} { allow read, write: if false; }`; `/workers` and `/daily_works` fail `keys().hasOnly(...)`, `calculatedWage >= 0`, `selectedMachines.size() >= 1`; `/admin_attendances` fails `isValidDateStr` regex and `isValidAttStatus`. | Live server rejects all 6 writes with `PERMISSION_DENIED` |
| 3 | Live collection count audit across all 7 collections confirms `3,106` production records remain untouched. | **Handled Safely** |

#### Conclusion
**Fix Verified** - Live Firestore server rules enforce default-deny on unknown paths and reject malformed or injected payloads before persistence.

### Concurrent Loom Production Double-Booking Race Condition

#### Summary
| Field | Value |
|---|---|
| Issue Type | Non-Atomic Read-Then-Write Concurrency Race |
| Impact | High |
| Affected File | `src/lib/firebase.ts:635-773` |
| Test Scenario | Two devices or tabs concurrently submit `DailyWork` for the same `(date, shift, workerId)` or overlapping `selectedMachines` on the same `(date, shift)`. |

#### How It Was Fixed
Implemented `createDailyWorkAtomic` using a Firestore `runTransaction` that checks server `daily_works` for legacy collisions and acquires deterministic lock documents (`daily_work_locks/W_{date}_{shift}_{workerId}` and `daily_work_locks/M_{date}_{shift}_{machineId}`) atomically in the same transaction.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | User clicks submit in `LoomDailyWork.tsx:221`; `isSubmitting` prevents duplicate local clicks. | Concurrent submissions across 2 devices enter `createDailyWorkAtomic` |
| 2 | `createDailyWorkAtomic` (`src/lib/firebase.ts:642-690`) queries existing same-date `daily_works` and reads all lock documents inside `runTransaction` prior to any writes. | First device acquires locks; second device sees existing lock or transaction conflict |
| 3 | Second transaction aborts cleanly and surfaces a clear conflict error banner in `LoomDailyWork.tsx` without mutating or deleting the first device's production log. | **Handled Safely** |

#### Conclusion
**Fix Verified** - Transactional lock acquisition prevents double-booking of operators or machines under concurrent web and mobile sessions while preserving existing records.
