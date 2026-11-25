/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  doc,
  getDocFromServer,
  getDocs,
  setDoc,
  deleteDoc,
  writeBatch,
  runTransaction,
  query,
  where,
  onSnapshot,
  Unsubscribe,
  Firestore
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { Worker, Machine, DailyWork, AdminAttendance, Attendance, Salary, Company } from '../types';

// Initialize Firebase App & Auth
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Initialize Firestore with multi-tab persistent cache when supported
function createFirestoreInstance(): Firestore {
  const dbId = firebaseConfig.firestoreDatabaseId;
  try {
    if (typeof window !== 'undefined' && typeof indexedDB !== 'undefined') {
      return dbId
        ? initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }, dbId)
        : initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
    }
  } catch {
    // Fallback if Firestore instance was already initialized (e.g. HMR)
  }
  return dbId ? getFirestore(app, dbId) : getFirestore(app);
}

export const db: Firestore = createFirestoreInstance();
export const FIREBASE_PROJECT_ID = firebaseConfig.projectId;
export const FIREBASE_DB_ID = firebaseConfig.firestoreDatabaseId || '(default)';

// ==========================================
// STRUCTURED FIRESTORE ERROR HANDLING
// ==========================================
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function formatCloudError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err || 'Operation failed');
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.error === 'string') {
      return parsed.error;
    }
  } catch {}
  return raw;
}

// ==========================================
// SANITIZATION & PAYLOAD BOUNDS (MATCHING BLUEPRINT)
// ==========================================
function cleanFirestoreData<T>(obj: T): T {
  if (obj === null || obj === undefined) return null as unknown as T;
  if (Array.isArray(obj)) {
    return obj.map(item => cleanFirestoreData(item)) as unknown as T;
  }
  if (typeof obj === 'object') {
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj as Record<string, any>)) {
      if (value !== undefined) {
        cleaned[key] = cleanFirestoreData(value);
      }
    }
    return cleaned as T;
  }
  return obj;
}

export function sanitizeDocId(id: string): string {
  const encoded = encodeURIComponent(String(id).trim()).replace(/%/g, '_');
  const safe = encoded.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  return safe || `doc_${Date.now()}`;
}

function clampString(val: unknown, maxLen: number, fallback = ''): string {
  const s = val === undefined || val === null ? fallback : String(val).trim();
  return s.slice(0, maxLen);
}

function clampNonNegative(val: unknown, maxVal = 100000000): number {
  const num = Number(val);
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.min(parseFloat(num.toFixed(2)), maxVal);
}

function normalizeWorkerPayload(worker: Worker) {
  return cleanFirestoreData({
    workerId: clampString(worker.workerId, 64),
    name: clampString(worker.name, 120),
    mobileNumber: clampString(worker.mobileNumber, 30),
    address: clampString(worker.address, 300),
    joiningDate: clampString(worker.joiningDate, 20),
    bankDetails: {
      bankName: clampString(worker.bankDetails?.bankName, 100),
      accountNumber: clampString(worker.bankDetails?.accountNumber, 40),
      ifscCode: clampString(worker.bankDetails?.ifscCode, 20).toUpperCase(),
      beneficiaryName: clampString(worker.bankDetails?.beneficiaryName, 120)
    },
    aadhaarNumber: clampString(worker.aadhaarNumber, 30),
    isActive: Boolean(worker.isActive ?? true),
    perMachineRate: clampNonNegative(worker.perMachineRate, 1000000),
    monthlySalary: worker.monthlySalary !== undefined ? clampNonNegative(worker.monthlySalary, 10000000) : undefined,
    monthlyDays: worker.monthlyDays !== undefined ? Math.min(31, clampNonNegative(worker.monthlyDays, 31)) : undefined,
    employeeType: (['Worker', 'Admin Employee', 'Others'].includes(worker.employeeType) ? worker.employeeType : 'Worker') as Worker['employeeType'],
    companyName: clampString(worker.companyName, 120)
  });
}

function normalizeDailyWorkPayload(work: DailyWork) {
  const selectedMachines = Array.isArray(work.selectedMachines)
    ? Array.from(new Set(work.selectedMachines.map(m => clampString(m, 64)).filter(Boolean))).slice(0, 50)
    : [];
  const rate = clampNonNegative(work.perMachineRate, 1000000);
  const wage = clampNonNegative(work.calculatedWage, 10000000);
  return cleanFirestoreData({
    workId: sanitizeDocId(work.workId),
    workerId: clampString(work.workerId, 64),
    date: clampString(work.date, 10),
    selectedMachines,
    machineCount: selectedMachines.length,
    perMachineRate: rate,
    calculatedWage: wage,
    shift: work.shift === 'Night' ? 'Night' : 'Day'
  });
}

function normalizeAdminAttendancePayload(attendance: AdminAttendance) {
  const status = (['Present', 'Absent', 'Half-Day'].includes(attendance.status) ? attendance.status : 'Present') as AdminAttendance['status'];
  return cleanFirestoreData({
    adminAttendanceId: sanitizeDocId(attendance.adminAttendanceId),
    workerId: clampString(attendance.workerId, 64),
    date: clampString(attendance.date, 10),
    status,
    calculatedWage: clampNonNegative(attendance.calculatedWage, 1000000),
    shift: attendance.shift === 'Night' ? 'Night' : 'Day'
  });
}

function normalizeAttendancePayload(attendance: Attendance) {
  const status = (['Present', 'Absent', 'Half-Day'].includes(attendance.status) ? attendance.status : 'Present') as Attendance['status'];
  return cleanFirestoreData({
    attendanceId: sanitizeDocId(attendance.attendanceId),
    workerId: clampString(attendance.workerId, 64),
    date: clampString(attendance.date, 10),
    status,
    inTime: clampString(attendance.inTime, 20),
    outTime: clampString(attendance.outTime, 20),
    shift: attendance.shift === 'Night' ? 'Night' : 'Day'
  });
}

function normalizeSalaryPayload(salary: Salary) {
  const baseSalary = clampNonNegative(salary.baseSalary);
  const bonus = clampNonNegative(salary.bonus);
  const advance = clampNonNegative(salary.advance);
  const deductions = clampNonNegative(salary.deductions);
  const netSalary = parseFloat((baseSalary + bonus - advance - deductions).toFixed(2));
  return cleanFirestoreData({
    salaryId: sanitizeDocId(salary.salaryId),
    workerId: clampString(salary.workerId, 64),
    month: clampString(salary.month, 7),
    baseSalary,
    bonus,
    advance,
    deductions,
    netSalary,
    status: salary.status === 'Paid' ? 'Paid' : 'Pending'
  });
}

// ==========================================
// TEST DATABASE CONNECTION
// ==========================================
export async function testConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
      return false;
    }
    return true;
  }
}

export async function testFirebaseConnection(): Promise<{ success: boolean; message: string; errorDetail?: string }> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return {
      success: true,
      message: `Connected to Firebase Firestore (${FIREBASE_PROJECT_ID}) successfully!`
    };
  } catch (err: any) {
    const msg = err?.message || String(err);
    if (msg.includes('the client is offline')) {
      return {
        success: false,
        message: 'Firebase Firestore client is offline. Changes will sync automatically once reconnected.',
        errorDetail: err?.stack || JSON.stringify(err)
      };
    }
    return {
      success: false,
      message: `Firebase connection notice: ${msg}`,
      errorDetail: err?.stack || JSON.stringify(err)
    };
  }
}

// ==========================================
// FETCH FUNCTIONS
// ==========================================

export async function fetchFirebaseCompanies(): Promise<Company[]> {
  try {
    const snapshot = await getDocs(collection(db, 'companies'));
    return snapshot.docs.map(d => {
      const data = d.data();
      return {
        companyId: data.companyId || d.id,
        name: data.name || ''
      };
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'companies');
  }
}

export async function fetchFirebaseWorkers(): Promise<Worker[]> {
  try {
    const snapshot = await getDocs(collection(db, 'workers'));
    return snapshot.docs.map(d => {
      const data = d.data();
      return {
        workerId: data.workerId || d.id,
        name: data.name || '',
        mobileNumber: data.mobileNumber || '',
        address: data.address || '',
        joiningDate: data.joiningDate || '',
        bankDetails: data.bankDetails || { bankName: '', accountNumber: '', ifscCode: '', beneficiaryName: '' },
        aadhaarNumber: data.aadhaarNumber || '',
        isActive: data.isActive ?? true,
        perMachineRate: Number(data.perMachineRate ?? 0),
        monthlySalary: data.monthlySalary !== undefined ? Number(data.monthlySalary) : undefined,
        monthlyDays: data.monthlyDays !== undefined ? Number(data.monthlyDays) : undefined,
        employeeType: data.employeeType || 'Worker',
        companyName: data.companyName || ''
      };
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'workers');
  }
}

export async function fetchFirebaseMachines(): Promise<Machine[]> {
  try {
    const snapshot = await getDocs(collection(db, 'machines'));
    return snapshot.docs.map(d => {
      const data = d.data();
      return {
        machineId: data.machineId || d.id,
        isActive: data.isActive ?? true,
        companyName: data.companyName || ''
      };
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'machines');
  }
}

export async function fetchFirebaseDailyWorks(): Promise<DailyWork[]> {
  try {
    const snapshot = await getDocs(collection(db, 'daily_works'));
    return snapshot.docs.map(d => {
      const data = d.data();
      return {
        workId: data.workId || d.id,
        workerId: data.workerId || '',
        date: data.date || '',
        selectedMachines: data.selectedMachines || [],
        machineCount: Number(data.machineCount ?? 0),
        perMachineRate: Number(data.perMachineRate ?? 0),
        calculatedWage: Number(data.calculatedWage ?? 0),
        shift: data.shift || 'Day'
      };
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'daily_works');
  }
}

export async function fetchFirebaseAdminAttendances(): Promise<AdminAttendance[]> {
  try {
    const snapshot = await getDocs(collection(db, 'admin_attendances'));
    return snapshot.docs.map(d => {
      const data = d.data();
      return {
        adminAttendanceId: data.adminAttendanceId || d.id,
        workerId: data.workerId || '',
        date: data.date || '',
        status: data.status || 'Present',
        calculatedWage: Number(data.calculatedWage ?? 0),
        shift: data.shift || 'Day'
      };
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'admin_attendances');
  }
}

export async function fetchFirebaseAttendances(): Promise<Attendance[]> {
  try {
    const snapshot = await getDocs(collection(db, 'attendances'));
    return snapshot.docs.map(d => {
      const data = d.data();
      return {
        attendanceId: data.attendanceId || d.id,
        workerId: data.workerId || '',
        date: data.date || '',
        status: data.status || 'Present',
        inTime: data.inTime || '',
        outTime: data.outTime || '',
        shift: data.shift || 'Day'
      };
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'attendances');
  }
}

export async function fetchFirebaseSalaries(): Promise<Salary[]> {
  try {
    const snapshot = await getDocs(collection(db, 'salaries'));
    return snapshot.docs.map(d => {
      const data = d.data();
      return {
        salaryId: data.salaryId || d.id,
        workerId: data.workerId || '',
        month: data.month || '',
        baseSalary: Number(data.baseSalary ?? 0),
        bonus: Number(data.bonus ?? 0),
        advance: Number(data.advance ?? 0),
        deductions: Number(data.deductions ?? 0),
        netSalary: Number(data.netSalary ?? 0),
        status: data.status || 'Pending'
      };
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'salaries');
  }
}

// ==========================================
// HELPERS FOR CHUNKED BATCH OPERATIONS
// ==========================================
async function commitBatchedDeletes(docRefs: Array<ReturnType<typeof doc>>) {
  const chunkSize = 400;
  for (let i = 0; i < docRefs.length; i += chunkSize) {
    const chunk = docRefs.slice(i, i + chunkSize);
    const batch = writeBatch(db);
    chunk.forEach(ref => batch.delete(ref));
    await batch.commit();
  }
}

// ==========================================
// CRUD OPERATIONS FOR WORKERS
// ==========================================

export async function createWorker(worker: Worker): Promise<void> {
  const docId = sanitizeDocId(worker.workerId);
  try {
    const docRef = doc(db, 'workers', docId);
    await setDoc(docRef, normalizeWorkerPayload(worker), { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `workers/${docId}`);
  }
}

export async function updateWorker(worker: Worker): Promise<void> {
  await createWorker(worker);
}

export async function deleteWorker(workerId: string): Promise<void> {
  const docId = sanitizeDocId(workerId);
  try {
    await deleteDoc(doc(db, 'workers', docId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `workers/${docId}`);
  }
}

/**
 * Atomic cascade delete querying Firestore directly so concurrent records
 * created on other tabs/devices are never missed or left orphaned.
 */
export async function deleteWorkerCascade(workerId: string): Promise<void> {
  try {
    const [dwSnap, aaSnap, attSnap, salSnap] = await Promise.all([
      getDocs(query(collection(db, 'daily_works'), where('workerId', '==', workerId))),
      getDocs(query(collection(db, 'admin_attendances'), where('workerId', '==', workerId))),
      getDocs(query(collection(db, 'attendances'), where('workerId', '==', workerId))),
      getDocs(query(collection(db, 'salaries'), where('workerId', '==', workerId)))
    ]);

    const refsToDelete: Array<ReturnType<typeof doc>> = [
      doc(db, 'workers', sanitizeDocId(workerId))
    ];

    dwSnap.docs.forEach(d => {
      refsToDelete.push(d.ref);
      const data = d.data();
      const date = clampString(data.date, 10);
      const shift = data.shift === 'Night' ? 'Night' : 'Day';
      if (date) {
        refsToDelete.push(doc(db, 'daily_work_locks', buildWorkerLockId(date, shift, workerId)));
        if (Array.isArray(data.selectedMachines)) {
          data.selectedMachines.forEach((mId: string) => {
            refsToDelete.push(doc(db, 'daily_work_locks', buildMachineLockId(date, shift, mId)));
          });
        }
      }
    });
    aaSnap.docs.forEach(d => refsToDelete.push(d.ref));
    attSnap.docs.forEach(d => refsToDelete.push(d.ref));
    salSnap.docs.forEach(d => refsToDelete.push(d.ref));

    await commitBatchedDeletes(refsToDelete);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `workers/${sanitizeDocId(workerId)}`);
  }
}

export async function batchSaveWorkers(workers: Worker[]): Promise<void> {
  if (!workers || workers.length === 0) return;
  try {
    const chunkSize = 400;
    for (let i = 0; i < workers.length; i += chunkSize) {
      const chunk = workers.slice(i, i + chunkSize);
      const batch = writeBatch(db);
      for (const w of chunk) {
        const docRef = doc(db, 'workers', sanitizeDocId(w.workerId));
        batch.set(docRef, normalizeWorkerPayload(w), { merge: true });
      }
      await batch.commit();
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'workers');
  }
}

// ==========================================
// CRUD OPERATIONS FOR COMPANIES
// ==========================================

export async function createCompany(company: Company): Promise<void> {
  const docId = sanitizeDocId(company.companyId);
  try {
    await setDoc(doc(db, 'companies', docId), cleanFirestoreData({
      companyId: docId,
      name: clampString(company.name, 120)
    }), { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `companies/${docId}`);
  }
}

export async function updateCompany(companyId: string, newName: string): Promise<void> {
  const docId = sanitizeDocId(companyId);
  try {
    await setDoc(doc(db, 'companies', docId), {
      companyId: docId,
      name: clampString(newName, 120)
    }, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `companies/${docId}`);
  }
}

/**
 * Atomic company rename updating the company document, all associated workers,
 * and all associated machines in chunked batches.
 */
export async function updateCompanyAtomic(companyId: string, oldName: string, newName: string): Promise<void> {
  const cleanNewName = clampString(newName, 120);
  const docId = sanitizeDocId(companyId);
  try {
    const [workersSnap, machinesSnap] = await Promise.all([
      getDocs(query(collection(db, 'workers'), where('companyName', '==', oldName))),
      getDocs(query(collection(db, 'machines'), where('companyName', '==', oldName)))
    ]);

    const ops: Array<{ ref: ReturnType<typeof doc>; data: Record<string, any> }> = [
      {
        ref: doc(db, 'companies', docId),
        data: { companyId: docId, name: cleanNewName }
      }
    ];

    workersSnap.docs.forEach(d => {
      ops.push({ ref: d.ref, data: { companyName: cleanNewName } });
    });
    machinesSnap.docs.forEach(d => {
      ops.push({ ref: d.ref, data: { companyName: cleanNewName } });
    });

    const chunkSize = 400;
    for (let i = 0; i < ops.length; i += chunkSize) {
      const batch = writeBatch(db);
      ops.slice(i, i + chunkSize).forEach(op => batch.set(op.ref, op.data, { merge: true }));
      await batch.commit();
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `companies/${docId}`);
  }
}

export async function deleteCompany(companyId: string): Promise<void> {
  const docId = sanitizeDocId(companyId);
  try {
    await deleteDoc(doc(db, 'companies', docId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `companies/${docId}`);
  }
}

// ==========================================
// CRUD OPERATIONS FOR MACHINES
// ==========================================

export async function createMachine(machine: Machine): Promise<void> {
  const docId = sanitizeDocId(machine.machineId);
  try {
    await setDoc(doc(db, 'machines', docId), cleanFirestoreData({
      machineId: clampString(machine.machineId, 64),
      isActive: Boolean(machine.isActive ?? true),
      companyName: clampString(machine.companyName, 120)
    }), { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `machines/${docId}`);
  }
}

export async function updateMachine(machine: Machine): Promise<void> {
  await createMachine(machine);
}

export async function deleteMachine(machineId: string): Promise<void> {
  const docId = sanitizeDocId(machineId);
  try {
    await deleteDoc(doc(db, 'machines', docId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `machines/${docId}`);
  }
}

// ==========================================
// ATOMIC DAILY WORKS + CONCURRENCY LOCKS
// ==========================================

export function buildWorkerLockId(date: string, shift: 'Day' | 'Night', workerId: string): string {
  return sanitizeDocId(`W_${date}_${shift}_${sanitizeDocId(workerId)}`);
}

export function buildMachineLockId(date: string, shift: 'Day' | 'Night', machineId: string): string {
  return sanitizeDocId(`M_${date}_${shift}_${sanitizeDocId(machineId)}`);
}

export async function createDailyWorkAtomic(work: DailyWork): Promise<DailyWork> {
  const normalized = normalizeDailyWorkPayload(work);
  if (!normalized.workerId || !normalized.date || normalized.selectedMachines.length === 0) {
    throw new Error('Operator, date, and at least one machine are required.');
  }

  // Server check against legacy daily_works that may predate lock docs
  const sameDateSnap = await getDocs(
    query(collection(db, 'daily_works'), where('date', '==', normalized.date))
  );

  const targetShift: 'Day' | 'Night' = normalized.shift === 'Night' ? 'Night' : 'Day';
  for (const d of sameDateSnap.docs) {
    const existing = d.data();
    const existingShift = existing.shift === 'Night' ? 'Night' : 'Day';
    if (existingShift !== targetShift) continue;

    if (existing.workerId === normalized.workerId) {
      throw new Error(`Production entry for operator ${normalized.workerId} (${targetShift} Shift) already exists on ${normalized.date}.`);
    }
    if (Array.isArray(existing.selectedMachines)) {
      const conflictMachine = normalized.selectedMachines.find((m: string) => existing.selectedMachines.includes(m));
      if (conflictMachine) {
        throw new Error(`Machine "${conflictMachine}" is already assigned for ${targetShift} Shift on ${normalized.date}.`);
      }
    }
  }

  const workRef = doc(db, 'daily_works', normalized.workId);
  const workerLockId = buildWorkerLockId(normalized.date, targetShift, normalized.workerId);
  const workerLockRef = doc(db, 'daily_work_locks', workerLockId);
  const machineLocks = normalized.selectedMachines.map((mId: string) => ({
    machineId: mId,
    lockId: buildMachineLockId(normalized.date, targetShift, mId),
    ref: doc(db, 'daily_work_locks', buildMachineLockId(normalized.date, targetShift, mId))
  }));

  try {
    await runTransaction(db, async (tx) => {
      // ALL READS MUST EXECUTE BEFORE ANY WRITES IN FIRESTORE TRANSACTIONS
      const workSnap = await tx.get(workRef);
      const workerLockSnap = await tx.get(workerLockRef);
      const machineLockSnaps = await Promise.all(machineLocks.map(ml => tx.get(ml.ref)));

      if (workSnap.exists()) {
        throw new Error('Duplicate production submission detected. Please wait for sync.');
      }
      if (workerLockSnap.exists()) {
        throw new Error(`Operator ${normalized.workerId} already has an entry for ${targetShift} Shift on ${normalized.date}.`);
      }
      for (let i = 0; i < machineLockSnaps.length; i++) {
        if (machineLockSnaps[i].exists()) {
          throw new Error(`Machine "${machineLocks[i].machineId}" was just assigned by another user for ${targetShift} Shift.`);
        }
      }

      tx.set(workRef, normalized);
      tx.set(workerLockRef, {
        lockId: workerLockId,
        lockType: 'worker',
        workId: normalized.workId,
        date: normalized.date,
        shift: targetShift,
        targetId: normalized.workerId
      });
      for (const ml of machineLocks) {
        tx.set(ml.ref, {
          lockId: ml.lockId,
          lockType: 'machine',
          workId: normalized.workId,
          date: normalized.date,
          shift: targetShift,
          targetId: ml.machineId
        });
      }
    });
    return normalized as DailyWork;
  } catch (err) {
    if (err instanceof Error && (
      err.message.includes('already') ||
      err.message.includes('Duplicate') ||
      err.message.includes('required')
    )) {
      throw err;
    }
    handleFirestoreError(err, OperationType.WRITE, `daily_works/${normalized.workId}`);
  }
}

export async function createDailyWork(work: DailyWork): Promise<void> {
  await createDailyWorkAtomic(work);
}

export async function updateDailyWork(work: DailyWork): Promise<void> {
  const normalized = normalizeDailyWorkPayload(work);
  try {
    await setDoc(doc(db, 'daily_works', normalized.workId), normalized, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `daily_works/${normalized.workId}`);
  }
}

export async function deleteDailyWork(workId: string): Promise<void> {
  const cleanWorkId = sanitizeDocId(workId);
  const workRef = doc(db, 'daily_works', cleanWorkId);
  try {
    await runTransaction(db, async (tx) => {
      const workSnap = await tx.get(workRef);
      if (!workSnap.exists()) return;

      const data = workSnap.data();
      const date = clampString(data.date, 10);
      const shift = data.shift === 'Night' ? 'Night' : 'Day';
      const workerId = clampString(data.workerId, 64);
      const machines: string[] = Array.isArray(data.selectedMachines) ? data.selectedMachines : [];

      const lockRefs: Array<ReturnType<typeof doc>> = [];
      if (date && workerId) {
        lockRefs.push(doc(db, 'daily_work_locks', buildWorkerLockId(date, shift, workerId)));
      }
      if (date) {
        machines.forEach(mId => {
          lockRefs.push(doc(db, 'daily_work_locks', buildMachineLockId(date, shift, mId)));
        });
      }

      const lockSnaps = await Promise.all(lockRefs.map(ref => tx.get(ref)));

      tx.delete(workRef);
      lockSnaps.forEach((snap, idx) => {
        if (snap.exists() && snap.data()?.workId === cleanWorkId) {
          tx.delete(lockRefs[idx]);
        }
      });
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `daily_works/${cleanWorkId}`);
  }
}

// ==========================================
// CRUD OPERATIONS FOR ADMIN & OTHER ATTENDANCE
// ==========================================

export function buildDeterministicAdminAttId(date: string, shift: 'Day' | 'Night', workerId: string): string {
  return sanitizeDocId(`AA_${date}_${shift}_${sanitizeDocId(workerId)}`);
}

export async function saveAdminAttendanceAtomic(attendance: AdminAttendance): Promise<AdminAttendance> {
  const shift = attendance.shift === 'Night' ? 'Night' : 'Day';
  try {
    // Check server for any pre-existing record for same (workerId, date, shift) to avoid duplicates
    const existingSnap = await getDocs(
      query(
        collection(db, 'admin_attendances'),
        where('workerId', '==', attendance.workerId),
        where('date', '==', attendance.date)
      )
    );
    const matchingExisting = existingSnap.docs.find(d => {
      const s = d.data().shift === 'Night' ? 'Night' : 'Day';
      return s === shift;
    });

    const docId = matchingExisting
      ? matchingExisting.id
      : sanitizeDocId(attendance.adminAttendanceId || buildDeterministicAdminAttId(attendance.date, shift, attendance.workerId));

    const payload = normalizeAdminAttendancePayload({
      ...attendance,
      adminAttendanceId: docId,
      shift
    });

    await setDoc(doc(db, 'admin_attendances', docId), payload, { merge: true });
    return payload as AdminAttendance;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'admin_attendances');
  }
}

export async function batchSaveAdminAttendances(records: AdminAttendance[]): Promise<AdminAttendance[]> {
  if (!records || records.length === 0) return [];
  const targetDate = records[0].date;
  try {
    // Query server once for this date to prevent duplicate concurrent entries
    const dateSnap = await getDocs(
      query(collection(db, 'admin_attendances'), where('date', '==', targetDate))
    );
    const existingKeyToId = new Map<string, string>();
    dateSnap.docs.forEach(d => {
      const data = d.data();
      const s = data.shift === 'Night' ? 'Night' : 'Day';
      existingKeyToId.set(`${data.workerId}__${data.date}__${s}`, d.id);
    });

    const normalizedList: AdminAttendance[] = records.map(rec => {
      const shift = rec.shift === 'Night' ? 'Night' : 'Day';
      const key = `${rec.workerId}__${rec.date}__${shift}`;
      const docId = existingKeyToId.get(key) || sanitizeDocId(rec.adminAttendanceId || buildDeterministicAdminAttId(rec.date, shift, rec.workerId));
      return normalizeAdminAttendancePayload({
        ...rec,
        adminAttendanceId: docId,
        shift
      }) as AdminAttendance;
    });

    const chunkSize = 400;
    for (let i = 0; i < normalizedList.length; i += chunkSize) {
      const batch = writeBatch(db);
      normalizedList.slice(i, i + chunkSize).forEach(item => {
        batch.set(doc(db, 'admin_attendances', item.adminAttendanceId), item, { merge: true });
      });
      await batch.commit();
    }
    return normalizedList;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'admin_attendances');
  }
}

export async function createAdminAttendance(attendance: AdminAttendance): Promise<void> {
  await saveAdminAttendanceAtomic(attendance);
}

export async function updateAdminAttendance(attendance: AdminAttendance): Promise<void> {
  await saveAdminAttendanceAtomic(attendance);
}

export async function deleteAdminAttendance(adminAttendanceId: string): Promise<void> {
  const docId = sanitizeDocId(adminAttendanceId);
  try {
    await deleteDoc(doc(db, 'admin_attendances', docId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `admin_attendances/${docId}`);
  }
}

// ==========================================
// CRUD OPERATIONS FOR LOOM ATTENDANCE
// ==========================================

export function buildDeterministicLoomAttId(date: string, shift: 'Day' | 'Night', workerId: string): string {
  return sanitizeDocId(`ATT_${date}_${shift}_${sanitizeDocId(workerId)}`);
}

export async function createAttendance(attendance: Attendance): Promise<void> {
  const shift = attendance.shift === 'Night' ? 'Night' : 'Day';
  const docId = sanitizeDocId(attendance.attendanceId || buildDeterministicLoomAttId(attendance.date, shift, attendance.workerId));
  try {
    const payload = normalizeAttendancePayload({
      ...attendance,
      attendanceId: docId,
      shift
    });
    await setDoc(doc(db, 'attendances', docId), payload, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `attendances/${docId}`);
  }
}

export async function updateAttendance(attendance: Attendance): Promise<void> {
  await createAttendance(attendance);
}

export async function deleteAttendance(attendanceId: string): Promise<void> {
  const docId = sanitizeDocId(attendanceId);
  try {
    await deleteDoc(doc(db, 'attendances', docId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `attendances/${docId}`);
  }
}

// ==========================================
// CRUD OPERATIONS FOR SALARIES
// ==========================================

export async function createSalary(salary: Salary): Promise<void> {
  const normalized = normalizeSalaryPayload(salary);
  try {
    const salRef = doc(db, 'salaries', normalized.salaryId);
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(salRef);
      if (snap.exists()) {
        const current = snap.data();
        if (current.status === 'Paid' && normalized.status === 'Paid') {
          const numericChanged =
            current.bonus !== normalized.bonus ||
            current.advance !== normalized.advance ||
            current.deductions !== normalized.deductions;
          if (numericChanged) {
            throw new Error('Cannot modify amounts on a Paid salary record. Mark as Pending first.');
          }
        }
      }
      tx.set(salRef, normalized, { merge: true });
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes('Paid salary')) {
      throw err;
    }
    handleFirestoreError(err, OperationType.WRITE, `salaries/${normalized.salaryId}`);
  }
}

export async function updateSalary(salary: Salary): Promise<void> {
  await createSalary(salary);
}

export async function deleteSalary(salaryId: string): Promise<void> {
  const docId = sanitizeDocId(salaryId);
  try {
    await deleteDoc(doc(db, 'salaries', docId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `salaries/${docId}`);
  }
}

// ==========================================
// NON-DESTRUCTIVE SYNC & ADMIN RESTORE/CLEAR
// ==========================================

/**
 * Safe additive sync: NEVER deletes existing cloud documents created by other
 * users or devices. Only uploads any local records missing from cloud.
 */
export async function syncLocalMissingToFirebase(params: {
  companies: Company[];
  workers: Worker[];
  machines: Machine[];
  dailyWorks: DailyWork[];
  adminAttendances: AdminAttendance[];
  attendances: Attendance[];
  salaries: Salary[];
}): Promise<void> {
  try {
    const [fbComp, fbWorkers, fbMachines, fbWorks, fbAdminAtt, fbAtt, fbSal] = await Promise.all([
      getDocs(collection(db, 'companies')),
      getDocs(collection(db, 'workers')),
      getDocs(collection(db, 'machines')),
      getDocs(collection(db, 'daily_works')),
      getDocs(collection(db, 'admin_attendances')),
      getDocs(collection(db, 'attendances')),
      getDocs(collection(db, 'salaries'))
    ]);

    const compIds = new Set(fbComp.docs.map(d => d.id));
    const workerIds = new Set(fbWorkers.docs.map(d => d.id));
    const machineIds = new Set(fbMachines.docs.map(d => d.id));
    const workIds = new Set(fbWorks.docs.map(d => d.id));
    const adminAttIds = new Set(fbAdminAtt.docs.map(d => d.id));
    const attIds = new Set(fbAtt.docs.map(d => d.id));
    const salIds = new Set(fbSal.docs.map(d => d.id));

    const pendingWrites: Array<{ ref: ReturnType<typeof doc>; data: Record<string, any> }> = [];

    params.companies.forEach(c => {
      const id = sanitizeDocId(c.companyId);
      if (!compIds.has(id)) {
        pendingWrites.push({ ref: doc(db, 'companies', id), data: cleanFirestoreData({ companyId: id, name: clampString(c.name, 120) }) });
      }
    });

    params.workers.forEach(w => {
      const id = sanitizeDocId(w.workerId);
      if (!workerIds.has(id)) {
        pendingWrites.push({ ref: doc(db, 'workers', id), data: normalizeWorkerPayload(w) });
      }
    });

    params.machines.forEach(m => {
      const id = sanitizeDocId(m.machineId);
      if (!machineIds.has(id)) {
        pendingWrites.push({ ref: doc(db, 'machines', id), data: cleanFirestoreData({ machineId: clampString(m.machineId, 64), isActive: Boolean(m.isActive ?? true), companyName: clampString(m.companyName, 120) }) });
      }
    });

    params.dailyWorks.forEach(dw => {
      const norm = normalizeDailyWorkPayload(dw);
      if (!workIds.has(norm.workId)) {
        pendingWrites.push({ ref: doc(db, 'daily_works', norm.workId), data: norm });
      }
    });

    params.adminAttendances.forEach(aa => {
      const norm = normalizeAdminAttendancePayload(aa);
      if (!adminAttIds.has(norm.adminAttendanceId)) {
        pendingWrites.push({ ref: doc(db, 'admin_attendances', norm.adminAttendanceId), data: norm });
      }
    });

    params.attendances.forEach(a => {
      const norm = normalizeAttendancePayload(a);
      if (!attIds.has(norm.attendanceId)) {
        pendingWrites.push({ ref: doc(db, 'attendances', norm.attendanceId), data: norm });
      }
    });

    params.salaries.forEach(s => {
      const norm = normalizeSalaryPayload(s);
      if (!salIds.has(norm.salaryId)) {
        pendingWrites.push({ ref: doc(db, 'salaries', norm.salaryId), data: norm });
      }
    });

    const chunkSize = 400;
    for (let i = 0; i < pendingWrites.length; i += chunkSize) {
      const batch = writeBatch(db);
      pendingWrites.slice(i, i + chunkSize).forEach(op => batch.set(op.ref, op.data, { merge: true }));
      await batch.commit();
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'sync');
  }
}

/**
 * Explicit Admin-only replacement used ONLY by Backup Restore, Reset Demo, or Clear All Data.
 * Uses chunked writeBatch operations instead of sequential unawaited deletes.
 */
async function replaceCollectionDocs<T>(
  collName: string,
  items: T[],
  getId: (item: T) => string,
  normalize: (item: T) => Record<string, any>
): Promise<void> {
  try {
    const snap = await getDocs(collection(db, collName));
    const desiredIds = new Set(items.map(item => getId(item)));
    const refsToDelete = snap.docs.filter(d => !desiredIds.has(d.id)).map(d => d.ref);
    await commitBatchedDeletes(refsToDelete);

    const chunkSize = 400;
    for (let i = 0; i < items.length; i += chunkSize) {
      const batch = writeBatch(db);
      items.slice(i, i + chunkSize).forEach(item => {
        const id = getId(item);
        batch.set(doc(db, collName, id), normalize(item), { merge: true });
      });
      await batch.commit();
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, collName);
  }
}

export async function reconcileCompaniesToFirebase(companies: Company[]): Promise<void> {
  await replaceCollectionDocs(
    'companies',
    companies,
    c => sanitizeDocId(c.companyId),
    c => cleanFirestoreData({ companyId: sanitizeDocId(c.companyId), name: clampString(c.name, 120) })
  );
}

export async function reconcileWorkersToFirebase(workers: Worker[]): Promise<void> {
  await replaceCollectionDocs(
    'workers',
    workers,
    w => sanitizeDocId(w.workerId),
    w => normalizeWorkerPayload(w)
  );
}

export async function reconcileMachinesToFirebase(machines: Machine[]): Promise<void> {
  await replaceCollectionDocs(
    'machines',
    machines,
    m => sanitizeDocId(m.machineId),
    m => cleanFirestoreData({ machineId: clampString(m.machineId, 64), isActive: Boolean(m.isActive ?? true), companyName: clampString(m.companyName, 120) })
  );
}

export async function reconcileDailyWorksToFirebase(dailyWorks: DailyWork[]): Promise<void> {
  await replaceCollectionDocs(
    'daily_works',
    dailyWorks,
    w => sanitizeDocId(w.workId),
    w => normalizeDailyWorkPayload(w)
  );
  // Clear stale locks on full restore/reset
  const lockSnap = await getDocs(collection(db, 'daily_work_locks'));
  await commitBatchedDeletes(lockSnap.docs.map(d => d.ref));
}

export async function reconcileAdminAttendancesToFirebase(adminAttendances: AdminAttendance[]): Promise<void> {
  await replaceCollectionDocs(
    'admin_attendances',
    adminAttendances,
    a => sanitizeDocId(a.adminAttendanceId),
    a => normalizeAdminAttendancePayload(a)
  );
}

export async function reconcileAttendancesToFirebase(attendances: Attendance[]): Promise<void> {
  await replaceCollectionDocs(
    'attendances',
    attendances,
    a => sanitizeDocId(a.attendanceId),
    a => normalizeAttendancePayload(a)
  );
}

export async function reconcileSalariesToFirebase(salaries: Salary[]): Promise<void> {
  await replaceCollectionDocs(
    'salaries',
    salaries,
    s => sanitizeDocId(s.salaryId),
    s => normalizeSalaryPayload(s)
  );
}

// ==========================================
// REAL-TIME FIRESTORE SUBSCRIPTIONS (LIVE SYNC)
// ==========================================

export function subscribeFirebaseCompanies(
  onData: (companies: Company[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const collRef = collection(db, 'companies');
  return onSnapshot(collRef, (snapshot) => {
    const list = snapshot.docs.map(d => {
      const data = d.data();
      return {
        companyId: data.companyId || d.id,
        name: data.name || ''
      };
    });
    onData(list);
  }, (err) => {
    console.warn('Real-time companies sync warning:', err?.message || err);
    onError?.(err);
  });
}

export function subscribeFirebaseWorkers(
  onData: (workers: Worker[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const collRef = collection(db, 'workers');
  return onSnapshot(collRef, (snapshot) => {
    const list = snapshot.docs.map(d => {
      const data = d.data();
      return {
        workerId: data.workerId || d.id,
        name: data.name || '',
        mobileNumber: data.mobileNumber || '',
        address: data.address || '',
        joiningDate: data.joiningDate || '',
        bankDetails: data.bankDetails || { bankName: '', accountNumber: '', ifscCode: '', beneficiaryName: '' },
        aadhaarNumber: data.aadhaarNumber || '',
        isActive: data.isActive ?? true,
        perMachineRate: Number(data.perMachineRate ?? 0),
        monthlySalary: data.monthlySalary !== undefined ? Number(data.monthlySalary) : undefined,
        monthlyDays: data.monthlyDays !== undefined ? Number(data.monthlyDays) : undefined,
        employeeType: data.employeeType || 'Worker',
        companyName: data.companyName || ''
      };
    });
    onData(list);
  }, (err) => {
    console.warn('Real-time workers sync warning:', err?.message || err);
    onError?.(err);
  });
}

export function subscribeFirebaseMachines(
  onData: (machines: Machine[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const collRef = collection(db, 'machines');
  return onSnapshot(collRef, (snapshot) => {
    const list = snapshot.docs.map(d => {
      const data = d.data();
      return {
        machineId: data.machineId || d.id,
        isActive: data.isActive ?? true,
        companyName: data.companyName || ''
      };
    });
    onData(list);
  }, (err) => {
    console.warn('Real-time machines sync warning:', err?.message || err);
    onError?.(err);
  });
}

export function subscribeFirebaseDailyWorks(
  onData: (works: DailyWork[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const collRef = collection(db, 'daily_works');
  return onSnapshot(collRef, (snapshot) => {
    const list = snapshot.docs.map(d => {
      const data = d.data();
      return {
        workId: data.workId || d.id,
        workerId: data.workerId || '',
        date: data.date || '',
        selectedMachines: data.selectedMachines || [],
        machineCount: Number(data.machineCount ?? 0),
        perMachineRate: Number(data.perMachineRate ?? 0),
        calculatedWage: Number(data.calculatedWage ?? 0),
        shift: data.shift || 'Day'
      };
    });
    onData(list);
  }, (err) => {
    console.warn('Real-time daily works sync warning:', err?.message || err);
    onError?.(err);
  });
}

export function subscribeFirebaseAdminAttendances(
  onData: (attendances: AdminAttendance[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const collRef = collection(db, 'admin_attendances');
  return onSnapshot(collRef, (snapshot) => {
    const list = snapshot.docs.map(d => {
      const data = d.data();
      return {
        adminAttendanceId: data.adminAttendanceId || d.id,
        workerId: data.workerId || '',
        date: data.date || '',
        status: data.status || 'Present',
        calculatedWage: Number(data.calculatedWage ?? 0),
        shift: data.shift || 'Day'
      };
    });
    onData(list);
  }, (err) => {
    console.warn('Real-time admin attendances sync warning:', err?.message || err);
    onError?.(err);
  });
}

export function subscribeFirebaseAttendances(
  onData: (attendances: Attendance[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const collRef = collection(db, 'attendances');
  return onSnapshot(collRef, (snapshot) => {
    const list = snapshot.docs.map(d => {
      const data = d.data();
      return {
        attendanceId: data.attendanceId || d.id,
        workerId: data.workerId || '',
        date: data.date || '',
        status: data.status || 'Present',
        inTime: data.inTime || '',
        outTime: data.outTime || '',
        shift: data.shift || 'Day'
      };
    });
    onData(list);
  }, (err) => {
    console.warn('Real-time attendances sync warning:', err?.message || err);
    onError?.(err);
  });
}

export function subscribeFirebaseSalaries(
  onData: (salaries: Salary[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const collRef = collection(db, 'salaries');
  return onSnapshot(collRef, (snapshot) => {
    const list = snapshot.docs.map(d => {
      const data = d.data();
      return {
        salaryId: data.salaryId || d.id,
        workerId: data.workerId || '',
        month: data.month || '',
        baseSalary: Number(data.baseSalary ?? 0),
        bonus: Number(data.bonus ?? 0),
        advance: Number(data.advance ?? 0),
        deductions: Number(data.deductions ?? 0),
        netSalary: Number(data.netSalary ?? 0),
        status: data.status || 'Pending'
      };
    });
    onData(list);
  }, (err) => {
    console.warn('Real-time salaries sync warning:', err?.message || err);
    onError?.(err);
  });
}
