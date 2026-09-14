/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  doc, 
  getDocs, 
  setDoc, 
  deleteDoc, 
  writeBatch
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { Worker, Machine, DailyWork, AdminAttendance, Attendance, Salary, Company } from '../types';

// Initialize Firebase App & Firestore instance
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

export const db = firebaseConfig.firestoreDatabaseId 
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app);

export const FIREBASE_PROJECT_ID = firebaseConfig.projectId;
export const FIREBASE_DB_ID = firebaseConfig.firestoreDatabaseId || '(default)';

/**
 * Utility to strip undefined values so Firestore never throws unsupported field value errors
 */
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

/**
 * Sanitize doc ID for Firestore (replace invalid slashes)
 */
function sanitizeDocId(id: string): string {
  return encodeURIComponent(String(id).trim()).replace(/%/g, '_');
}

// ==========================================
// TEST DATABASE CONNECTION
// ==========================================
export async function testFirebaseConnection(): Promise<{ success: boolean; message: string; errorDetail?: string }> {
  try {
    const collRef = collection(db, 'companies');
    await getDocs(collRef);
    return { 
      success: true, 
      message: `Connected to Firebase Firestore (${FIREBASE_PROJECT_ID}) successfully!` 
    };
  } catch (err: any) {
    return { 
      success: false, 
      message: `Firebase connection notice: ${err?.message || err}`,
      errorDetail: err?.stack || JSON.stringify(err)
    };
  }
}

// ==========================================
// FETCH FUNCTIONS
// ==========================================

export async function fetchFirebaseCompanies(): Promise<Company[]> {
  try {
    const collRef = collection(db, 'companies');
    const snapshot = await getDocs(collRef);
    return snapshot.docs.map(d => {
      const data = d.data();
      return {
        companyId: data.companyId || d.id,
        name: data.name || ''
      };
    });
  } catch (err: any) {
    console.warn('Firebase fetch companies notice:', err.message);
    return [];
  }
}

export async function fetchFirebaseWorkers(): Promise<Worker[]> {
  const collRef = collection(db, 'workers');
  const snapshot = await getDocs(collRef);
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
}

export async function fetchFirebaseMachines(): Promise<Machine[]> {
  const collRef = collection(db, 'machines');
  const snapshot = await getDocs(collRef);
  return snapshot.docs.map(d => {
    const data = d.data();
    return {
      machineId: data.machineId || d.id,
      isActive: data.isActive ?? true,
      companyName: data.companyName || ''
    };
  });
}

export async function fetchFirebaseDailyWorks(): Promise<DailyWork[]> {
  const collRef = collection(db, 'daily_works');
  const snapshot = await getDocs(collRef);
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
}

export async function fetchFirebaseAdminAttendances(): Promise<AdminAttendance[]> {
  const collRef = collection(db, 'admin_attendances');
  const snapshot = await getDocs(collRef);
  return snapshot.docs.map(d => {
    const data = d.data();
    return {
      adminAttendanceId: data.adminAttendanceId || d.id,
      workerId: data.workerId || '',
      date: data.date || '',
      status: data.status || 'Present',
      calculatedWage: Number(data.calculatedWage ?? 0)
    };
  });
}

export async function fetchFirebaseAttendances(): Promise<Attendance[]> {
  const collRef = collection(db, 'attendances');
  const snapshot = await getDocs(collRef);
  return snapshot.docs.map(d => {
    const data = d.data();
    return {
      attendanceId: data.attendanceId || d.id,
      workerId: data.workerId || '',
      date: data.date || '',
      status: data.status || 'Present',
      inTime: data.inTime || '',
      outTime: data.outTime || ''
    };
  });
}

export async function fetchFirebaseSalaries(): Promise<Salary[]> {
  const collRef = collection(db, 'salaries');
  const snapshot = await getDocs(collRef);
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
}

// ==========================================
// CRUD OPERATIONS FOR WORKERS
// ==========================================

export async function createWorker(worker: Worker): Promise<void> {
  const docRef = doc(db, 'workers', sanitizeDocId(worker.workerId));
  const payload = cleanFirestoreData({
    workerId: worker.workerId,
    name: worker.name,
    mobileNumber: worker.mobileNumber || '',
    address: worker.address || '',
    joiningDate: worker.joiningDate || '',
    bankDetails: worker.bankDetails || {},
    aadhaarNumber: worker.aadhaarNumber || '',
    isActive: worker.isActive ?? true,
    perMachineRate: worker.perMachineRate || 0,
    monthlySalary: worker.monthlySalary,
    monthlyDays: worker.monthlyDays,
    employeeType: worker.employeeType || 'Worker',
    companyName: worker.companyName || ''
  });
  await setDoc(docRef, payload, { merge: true });
}

export async function updateWorker(worker: Worker): Promise<void> {
  await createWorker(worker);
}

export async function deleteWorker(workerId: string): Promise<void> {
  const docRef = doc(db, 'workers', sanitizeDocId(workerId));
  await deleteDoc(docRef);
}

/**
 * Bulk save workers (ideal for Excel sheet import)
 * Writes in chunks of up to 400 docs per Firestore batch for maximum speed and safety
 */
export async function batchSaveWorkers(workers: Worker[]): Promise<void> {
  if (!workers || workers.length === 0) return;
  const chunkSize = 400;
  for (let i = 0; i < workers.length; i += chunkSize) {
    const chunk = workers.slice(i, i + chunkSize);
    const batch = writeBatch(db);
    for (const w of chunk) {
      const docRef = doc(db, 'workers', sanitizeDocId(w.workerId));
      const payload = cleanFirestoreData({
        workerId: w.workerId,
        name: w.name,
        mobileNumber: w.mobileNumber || '',
        address: w.address || '',
        joiningDate: w.joiningDate || '',
        bankDetails: w.bankDetails || {},
        aadhaarNumber: w.aadhaarNumber || '',
        isActive: w.isActive ?? true,
        perMachineRate: w.perMachineRate || 0,
        monthlySalary: w.monthlySalary,
        monthlyDays: w.monthlyDays,
        employeeType: w.employeeType || 'Worker',
        companyName: w.companyName || ''
      });
      batch.set(docRef, payload, { merge: true });
    }
    await batch.commit();
  }
}

// ==========================================
// CRUD OPERATIONS FOR COMPANIES
// ==========================================

export async function createCompany(company: Company): Promise<void> {
  const docRef = doc(db, 'companies', sanitizeDocId(company.companyId));
  await setDoc(docRef, cleanFirestoreData(company), { merge: true });
}

export async function updateCompany(companyId: string, newName: string): Promise<void> {
  const docRef = doc(db, 'companies', sanitizeDocId(companyId));
  await setDoc(docRef, { companyId, name: newName }, { merge: true });
}

export async function deleteCompany(companyId: string): Promise<void> {
  const docRef = doc(db, 'companies', sanitizeDocId(companyId));
  await deleteDoc(docRef);
}

// ==========================================
// CRUD OPERATIONS FOR MACHINES
// ==========================================

export async function createMachine(machine: Machine): Promise<void> {
  const docRef = doc(db, 'machines', sanitizeDocId(machine.machineId));
  await setDoc(docRef, cleanFirestoreData(machine), { merge: true });
}

export async function updateMachine(machine: Machine): Promise<void> {
  await createMachine(machine);
}

export async function deleteMachine(machineId: string): Promise<void> {
  const docRef = doc(db, 'machines', sanitizeDocId(machineId));
  await deleteDoc(docRef);
}

// ==========================================
// CRUD OPERATIONS FOR DAILY WORKS
// ==========================================

export async function createDailyWork(work: DailyWork): Promise<void> {
  const docRef = doc(db, 'daily_works', sanitizeDocId(work.workId));
  await setDoc(docRef, cleanFirestoreData(work), { merge: true });
}

export async function updateDailyWork(work: DailyWork): Promise<void> {
  await createDailyWork(work);
}

export async function deleteDailyWork(workId: string): Promise<void> {
  const docRef = doc(db, 'daily_works', sanitizeDocId(workId));
  await deleteDoc(docRef);
}

// ==========================================
// CRUD OPERATIONS FOR ADMIN ATTENDANCE
// ==========================================

export async function createAdminAttendance(attendance: AdminAttendance): Promise<void> {
  const docRef = doc(db, 'admin_attendances', sanitizeDocId(attendance.adminAttendanceId));
  await setDoc(docRef, cleanFirestoreData(attendance), { merge: true });
}

export async function updateAdminAttendance(attendance: AdminAttendance): Promise<void> {
  await createAdminAttendance(attendance);
}

export async function deleteAdminAttendance(adminAttendanceId: string): Promise<void> {
  const docRef = doc(db, 'admin_attendances', sanitizeDocId(adminAttendanceId));
  await deleteDoc(docRef);
}

// ==========================================
// CRUD OPERATIONS FOR LOOM ATTENDANCE
// ==========================================

export async function createAttendance(attendance: Attendance): Promise<void> {
  const docRef = doc(db, 'attendances', sanitizeDocId(attendance.attendanceId));
  await setDoc(docRef, cleanFirestoreData(attendance), { merge: true });
}

export async function updateAttendance(attendance: Attendance): Promise<void> {
  await createAttendance(attendance);
}

export async function deleteAttendance(attendanceId: string): Promise<void> {
  const docRef = doc(db, 'attendances', sanitizeDocId(attendanceId));
  await deleteDoc(docRef);
}

// ==========================================
// CRUD OPERATIONS FOR SALARIES
// ==========================================

export async function createSalary(salary: Salary): Promise<void> {
  const docRef = doc(db, 'salaries', sanitizeDocId(salary.salaryId));
  await setDoc(docRef, cleanFirestoreData(salary), { merge: true });
}

export async function updateSalary(salary: Salary): Promise<void> {
  await createSalary(salary);
}

export async function deleteSalary(salaryId: string): Promise<void> {
  const docRef = doc(db, 'salaries', sanitizeDocId(salaryId));
  await deleteDoc(docRef);
}

// ==========================================
// RECONCILIATION / SYNC FUNCTIONS
// ==========================================

export async function reconcileCompaniesToFirebase(companies: Company[]): Promise<void> {
  const snapshot = await getDocs(collection(db, 'companies'));
  const remoteIds = snapshot.docs.map(d => d.id);
  const currentIds = new Set(companies.map(c => sanitizeDocId(c.companyId)));

  const idsToDelete = remoteIds.filter(id => !currentIds.has(id));
  for (const id of idsToDelete) {
    await deleteDoc(doc(db, 'companies', id)).catch(() => {});
  }

  for (const c of companies) {
    await createCompany(c);
  }
}

export async function reconcileWorkersToFirebase(workers: Worker[]): Promise<void> {
  const snapshot = await getDocs(collection(db, 'workers'));
  const remoteIds = snapshot.docs.map(d => d.id);
  const currentIds = new Set(workers.map(w => sanitizeDocId(w.workerId)));

  const idsToDelete = remoteIds.filter(id => !currentIds.has(id));
  for (const id of idsToDelete) {
    await deleteDoc(doc(db, 'workers', id)).catch(() => {});
  }

  await batchSaveWorkers(workers);
}

export async function reconcileMachinesToFirebase(machines: Machine[]): Promise<void> {
  const snapshot = await getDocs(collection(db, 'machines'));
  const remoteIds = snapshot.docs.map(d => d.id);
  const currentIds = new Set(machines.map(m => sanitizeDocId(m.machineId)));

  const idsToDelete = remoteIds.filter(id => !currentIds.has(id));
  for (const id of idsToDelete) {
    await deleteDoc(doc(db, 'machines', id)).catch(() => {});
  }

  for (const m of machines) {
    await createMachine(m);
  }
}

export async function reconcileDailyWorksToFirebase(dailyWorks: DailyWork[]): Promise<void> {
  const snapshot = await getDocs(collection(db, 'daily_works'));
  const remoteIds = snapshot.docs.map(d => d.id);
  const currentIds = new Set(dailyWorks.map(w => sanitizeDocId(w.workId)));

  const idsToDelete = remoteIds.filter(id => !currentIds.has(id));
  for (const id of idsToDelete) {
    await deleteDoc(doc(db, 'daily_works', id)).catch(() => {});
  }

  for (const w of dailyWorks) {
    await createDailyWork(w);
  }
}

export async function reconcileAdminAttendancesToFirebase(adminAttendances: AdminAttendance[]): Promise<void> {
  const snapshot = await getDocs(collection(db, 'admin_attendances'));
  const remoteIds = snapshot.docs.map(d => d.id);
  const currentIds = new Set(adminAttendances.map(a => sanitizeDocId(a.adminAttendanceId)));

  const idsToDelete = remoteIds.filter(id => !currentIds.has(id));
  for (const id of idsToDelete) {
    await deleteDoc(doc(db, 'admin_attendances', id)).catch(() => {});
  }

  for (const a of adminAttendances) {
    await createAdminAttendance(a);
  }
}

export async function reconcileAttendancesToFirebase(attendances: Attendance[]): Promise<void> {
  const snapshot = await getDocs(collection(db, 'attendances'));
  const remoteIds = snapshot.docs.map(d => d.id);
  const currentIds = new Set(attendances.map(a => sanitizeDocId(a.attendanceId)));

  const idsToDelete = remoteIds.filter(id => !currentIds.has(id));
  for (const id of idsToDelete) {
    await deleteDoc(doc(db, 'attendances', id)).catch(() => {});
  }

  for (const a of attendances) {
    await createAttendance(a);
  }
}

export async function reconcileSalariesToFirebase(salaries: Salary[]): Promise<void> {
  const snapshot = await getDocs(collection(db, 'salaries'));
  const remoteIds = snapshot.docs.map(d => d.id);
  const currentIds = new Set(salaries.map(s => sanitizeDocId(s.salaryId)));

  const idsToDelete = remoteIds.filter(id => !currentIds.has(id));
  for (const id of idsToDelete) {
    await deleteDoc(doc(db, 'salaries', id)).catch(() => {});
  }

  for (const s of salaries) {
    await createSalary(s);
  }
}
