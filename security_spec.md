# TexFlow ERP Firestore Security Specification

## 1. Data Invariants
1. All unknown Firestore paths are denied by default (`match /{document=**} { allow read, write: if false; }`).
2. All document ID path variables (`companyId`, `workerId`, `machineId`, `workId`, `lockId`, `attendanceId`, `salaryId`) must match `^[a-zA-Z0-9_\-]+$` and be at most 128 characters.
3. No shadow/ghost fields are accepted on create or update (`keys().hasOnly(...)` and `affectedKeys().hasOnly(...)`).
4. Every string field enforces strict `.size()` bounds; array fields (`selectedMachines`) enforce `size() >= 1 && size() <= 50` and first-element type checks (`selectedMachines[0] is string`).
5. Primary entity identifiers (`companyId`, `workerId`, `machineId`, `workId`, `lockId`, `adminAttendanceId`, `attendanceId`, `salaryId`, `month`) are immutable after creation.
6. Numeric fields (`perMachineRate`, `calculatedWage`, `machineCount`, `bonus`, `advance`, `deductions`, `baseSalary`) enforce non-negative bounds where appropriate (`>= 0`).
7. Daily loom production records cannot have `machineCount != selectedMachines.size()` or invalid shift values outside `['Day', 'Night']`.
8. Paid salary records are locked against casual numeric tampering (`status == 'Paid'` requires explicit reversal or admin override).

## 2. Adversarial Payloads ("Dirty Dozen")
1. **Unregistered Collection Write**: Writing to `/rogue_collection/doc1` -> Denied by global safety net.
2. **Oversized Document ID Poisoning**: Creating `/workers/<200-char-id>` -> Denied by `isValidId()`.
3. **Ghost / Shadow Field Injection**: Creating `/workers/999` with extra field `isAdmin: true` -> Denied by `keys().hasOnly(...)`.
4. **Update Shadow Field Injection**: Updating `/workers/1` with `affectedKeys` containing `role: "admin"` -> Denied by `affectedKeys().hasOnly(...)`.
5. **Type Poisoning**: Creating `/daily_works/DW-1` with `machineCount: "two"` instead of number -> Denied by `isValidDailyWork()`.
6. **Negative Wage / Rate Tampering**: Creating `/daily_works/DW-1` with `calculatedWage: -5000` -> Denied by `>= 0`.
7. **Machine Count Mismatch**: Creating `/daily_works/DW-1` with `selectedMachines: ["01"]` and `machineCount: 10` -> Denied by `machineCount == selectedMachines.size()`.
8. **Empty Machine Array**: Creating `/daily_works/DW-1` with `selectedMachines: []` -> Denied by `size() >= 1`.
9. **Malformed Date String**: Creating `/admin_attendances/AA-1` with `date: "not-a-date"` -> Denied by regex `^\\d{4}-\\d{2}-\\d{2}$`.
10. **Invalid Status Enum**: Creating `/admin_attendances/AA-1` with `status: "SuperPresent"` -> Denied by enum list check.
11. **Immutable ID Mutation on Update**: Updating `/workers/1` and changing `workerId` from `"1"` to `"2"` -> Denied by `incoming().workerId == existing().workerId`.
12. **Giant String Denial-of-Wallet**: Updating `/companies/comp-1` with a 10KB `name` -> Denied by `name.size() <= 120`.
