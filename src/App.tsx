/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Worker, Machine, DailyWork, AdminAttendance, Attendance, Salary, UserSession, Company 
} from './types';
import { 
  DEFAULT_MACHINES, SEED_WORKERS, SEED_DAILY_WORK, 
  SEED_ADMIN_ATTENDANCE, SEED_LOOM_ATTENDANCE, SEED_SALARIES, DEFAULT_COMPANIES 
} from './utils';
import DashboardOverview from './components/DashboardOverview';
import WorkersDirectory from './components/WorkersDirectory';
import LoomDailyWork from './components/LoomDailyWork';
import AdminAttendanceRegister from './components/AdminAttendanceRegister';
import OtherAttendanceRegister from './components/OtherAttendanceRegister';
import MonthlySalarySheet from './components/MonthlySalarySheet';
import MachineRegistry from './components/MachineRegistry';
import ConfirmModal from './components/ConfirmModal';
import LoginModal from './components/LoginModal';
import ClearDataModal from './components/ClearDataModal';
import SettingsPanel from './components/SettingsPanel';
import LoomReportsRegister from './components/LoomReportsRegister';

import { 
  Cpu, Users, Cpu as LoomIcon, Building, FileText, 
  Settings, ShieldCheck, Factory,
  Menu, X, Monitor, Laptop, Chrome, ArrowUpRight,
  Database, RefreshCw, CheckCircle2, AlertCircle,
  LogOut, User
} from 'lucide-react';
import { 
  testFirebaseConnection, 
  fetchFirebaseWorkers, fetchFirebaseMachines, fetchFirebaseDailyWorks,
  fetchFirebaseAdminAttendances, fetchFirebaseAttendances, fetchFirebaseSalaries, fetchFirebaseCompanies,
  subscribeFirebaseWorkers, subscribeFirebaseMachines, subscribeFirebaseDailyWorks,
  subscribeFirebaseAdminAttendances, subscribeFirebaseAttendances, subscribeFirebaseSalaries, subscribeFirebaseCompanies,
  createWorker, updateWorker, deleteWorkerCascade, batchSaveWorkers,
  createMachine, updateMachine, deleteMachine,
  createDailyWorkAtomic, deleteDailyWork,
  saveAdminAttendanceAtomic, batchSaveAdminAttendances, deleteAdminAttendance,
  createAttendance, deleteAttendance,
  createSalary,
  createCompany, updateCompanyAtomic, deleteCompany,
  syncLocalMissingToFirebase,
  reconcileWorkersToFirebase, reconcileMachinesToFirebase, reconcileDailyWorksToFirebase,
  reconcileAdminAttendancesToFirebase, reconcileAttendancesToFirebase, reconcileSalariesToFirebase,
  reconcileCompaniesToFirebase,
  formatCloudError,
  FIREBASE_PROJECT_ID
} from './lib/firebase';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isConfirmResetOpen, setIsConfirmResetOpen] = useState(false);
  const [isConfirmClearDataOpen, setIsConfirmClearDataOpen] = useState(false);
  const [deleteCompanyConfirm, setDeleteCompanyConfirm] = useState<{ isOpen: boolean; companyId: string; message: string }>({
    isOpen: false,
    companyId: '',
    message: ''
  });
  const [toast, setToast] = useState<{ id: number; type: 'success' | 'error' | 'warning'; message: string } | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback((type: 'success' | 'error' | 'warning', message: string) => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    setToast({ id: Date.now(), type, message });
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
    }, 5000);
  }, []);

  // --- Authentication States ---
  const [currentSession, setCurrentSession] = useState<UserSession | null>(() => {
    try {
      const saved = localStorage.getItem('texflow_auth_session');
      if (saved) return JSON.parse(saved);
    } catch {}
    return null;
  });
  const [isLoginModalOpen, setIsLoginModalOpen] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('texflow_auth_session');
      return !saved;
    } catch {}
    return true;
  });

  const isAdmin = currentSession?.role === 'admin';
  const isSupervisor1 = currentSession?.role === 'supervisor1';
  const isSupervisor2 = currentSession?.role === 'supervisor2';
  const isSupervisor = isSupervisor1 || isSupervisor2;

  // Enforce role-based strict tab locks for supervisors
  useEffect(() => {
    if (isSupervisor1 && activeTab !== 'production') {
      setActiveTab('production');
    } else if (isSupervisor2 && activeTab !== 'other-att') {
      setActiveTab('other-att');
    }
  }, [isSupervisor1, isSupervisor2, activeTab]);

  const handleLogout = () => {
    try {
      localStorage.removeItem('texflow_auth_session');
    } catch {}
    setCurrentSession(null);
    setIsLoginModalOpen(true);
  };

  // --- PWA Desktop Installation States ---
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [showInstallGuide, setShowInstallGuide] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Check if running in standalone mode (already installed as desktop app)
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstallable(false);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`User installation choice outcome: ${outcome}`);
      setDeferredPrompt(null);
      setIsInstallable(false);
    } else {
      // Show step-by-step user guide for browser installation
      setShowInstallGuide(true);
    }
  };

  // Helper to load state from localStorage with fallback
  const getLocalData = <T,>(key: string, fallback: T): T => {
    try {
      const item = localStorage.getItem(key);
      if (item !== null) {
        const parsed = JSON.parse(item);
        if (Array.isArray(parsed)) return parsed as unknown as T;
      }
    } catch (e) {
      console.warn(`Failed to parse localStorage for ${key}`, e);
    }
    return fallback;
  };

  // --- Database & Supabase Persistence States ---
  const [companies, setCompanies] = useState<Company[]>(() => getLocalData('texflow_companies', DEFAULT_COMPANIES));
  const [workers, setWorkers] = useState<Worker[]>(() => getLocalData('texflow_workers', []));
  const [machines, setMachines] = useState<Machine[]>(() => getLocalData('texflow_machines', DEFAULT_MACHINES));
  const [dailyWorks, setDailyWorks] = useState<DailyWork[]>(() => getLocalData('texflow_dailyWorks', []));
  const [adminAttendances, setAdminAttendances] = useState<AdminAttendance[]>(() => getLocalData('texflow_adminAttendances', []));
  const [attendances, setAttendances] = useState<Attendance[]>(() => getLocalData('texflow_attendances', []));
  const [salaries, setSalaries] = useState<Salary[]>(() => getLocalData('texflow_salaries', []));

  // Sync state to localStorage whenever it changes
  useEffect(() => { localStorage.setItem('texflow_companies', JSON.stringify(companies)); }, [companies]);
  useEffect(() => { localStorage.setItem('texflow_workers', JSON.stringify(workers)); }, [workers]);
  useEffect(() => { localStorage.setItem('texflow_machines', JSON.stringify(machines)); }, [machines]);
  useEffect(() => { localStorage.setItem('texflow_dailyWorks', JSON.stringify(dailyWorks)); }, [dailyWorks]);
  useEffect(() => { localStorage.setItem('texflow_adminAttendances', JSON.stringify(adminAttendances)); }, [adminAttendances]);
  useEffect(() => { localStorage.setItem('texflow_attendances', JSON.stringify(attendances)); }, [attendances]);
  useEffect(() => { localStorage.setItem('texflow_salaries', JSON.stringify(salaries)); }, [salaries]);

  // Firebase Status States
  const [cloudStatus, setCloudStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [cloudMsg, setCloudMsg] = useState<string>('Connecting to Firebase Firestore...');
  const [showDbModal, setShowDbModal] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // --- Load Data on Boot (From Firebase Firestore + Zero Data Loss Local Merge) ---
  useEffect(() => {
    let unsubs: Array<() => void> = [];

    async function initData() {
      setCloudStatus('connecting');
      setCloudMsg('Connecting to Firebase Firestore...');
      const conn = await testFirebaseConnection();

      if (!conn.success) {
        setCloudStatus('error');
        setCloudMsg(`Operating on Local Storage (${conn.message})`);
        return;
      }

      setCloudStatus('connected');
      setCloudMsg('Connected & Live Synced with Firebase Firestore');

      try {
        const fetchResults = await Promise.all([
          fetchFirebaseCompanies().then(v => ({ ok: true as const, data: v })).catch(() => ({ ok: false as const, data: null })),
          fetchFirebaseWorkers().then(v => ({ ok: true as const, data: v })).catch(() => ({ ok: false as const, data: null })),
          fetchFirebaseMachines().then(v => ({ ok: true as const, data: v })).catch(() => ({ ok: false as const, data: null })),
          fetchFirebaseDailyWorks().then(v => ({ ok: true as const, data: v })).catch(() => ({ ok: false as const, data: null })),
          fetchFirebaseAdminAttendances().then(v => ({ ok: true as const, data: v })).catch(() => ({ ok: false as const, data: null })),
          fetchFirebaseAttendances().then(v => ({ ok: true as const, data: v })).catch(() => ({ ok: false as const, data: null })),
          fetchFirebaseSalaries().then(v => ({ ok: true as const, data: v })).catch(() => ({ ok: false as const, data: null }))
        ]);

        const [resComp, resWorkers, resMachines, resWorks, resAdminAtt, resAtt, resSal] = fetchResults;
        const fbCompanies = resComp.data;
        const fbWorkers = resWorkers.data;
        const fbMachines = resMachines.data;
        const fbWorks = resWorks.data;
        const fbAdminAtt = resAdminAtt.data;
        const fbAtt = resAtt.data;
        const fbSalaries = resSal.data;

        // 1. SAFE MERGE COMPANIES
        const localCompanies = getLocalData<Company[]>('texflow_companies', DEFAULT_COMPANIES);
        const compMap = new Map<string, Company>();
        localCompanies.forEach(c => compMap.set(c.companyId, c));
        (fbCompanies || []).forEach(c => compMap.set(c.companyId, c));
        const mergedCompanies = compMap.size > 0 ? Array.from(compMap.values()) : DEFAULT_COMPANIES;
        setCompanies(mergedCompanies);
        try { localStorage.setItem('texflow_companies', JSON.stringify(mergedCompanies)); } catch {}

        // 2. SAFE MERGE WORKERS
        const localWorkers = getLocalData<Worker[]>('texflow_workers', []);
        const workerMap = new Map<string, Worker>();
        localWorkers.forEach(w => workerMap.set(w.workerId.toLowerCase(), w));
        (fbWorkers || []).forEach(w => workerMap.set(w.workerId.toLowerCase(), w));
        const mergedWorkers = Array.from(workerMap.values());
        setWorkers(mergedWorkers);
        try { localStorage.setItem('texflow_workers', JSON.stringify(mergedWorkers)); } catch {}

        if (resWorkers.ok) {
          const unsyncedWorkers = localWorkers.filter(lw =>
            !(fbWorkers || []).some(fw => fw.workerId.toLowerCase() === lw.workerId.toLowerCase())
          );
          if (unsyncedWorkers.length > 0) {
            batchSaveWorkers(unsyncedWorkers).catch(err => console.warn('Background sync for unsynced workers:', err));
          }
        }

        // 3. SAFE MERGE MACHINES
        const localMachines = getLocalData<Machine[]>('texflow_machines', DEFAULT_MACHINES);
        const machineMap = new Map<string, Machine>();
        localMachines.forEach(m => machineMap.set(m.machineId, m));
        (fbMachines || []).forEach(m => machineMap.set(m.machineId, m));
        const mergedMachines = machineMap.size > 0 ? Array.from(machineMap.values()) : DEFAULT_MACHINES;
        setMachines(mergedMachines);
        try { localStorage.setItem('texflow_machines', JSON.stringify(mergedMachines)); } catch {}

        // 4. SAFE MERGE DAILY WORKS
        const localWorks = getLocalData<DailyWork[]>('texflow_dailyWorks', []);
        const worksMap = new Map<string, DailyWork>();
        localWorks.forEach(dw => worksMap.set(dw.workId, dw));
        (fbWorks || []).forEach(dw => worksMap.set(dw.workId, dw));
        const mergedWorks = Array.from(worksMap.values());
        setDailyWorks(mergedWorks);
        try { localStorage.setItem('texflow_dailyWorks', JSON.stringify(mergedWorks)); } catch {}

        // 5. SAFE MERGE ADMIN ATTENDANCES
        const localAdminAtt = getLocalData<AdminAttendance[]>('texflow_adminAttendances', []);
        const adminAttMap = new Map<string, AdminAttendance>();
        localAdminAtt.forEach(a => adminAttMap.set(a.adminAttendanceId, a));
        (fbAdminAtt || []).forEach(a => adminAttMap.set(a.adminAttendanceId, a));
        const mergedAdminAtt = Array.from(adminAttMap.values());
        setAdminAttendances(mergedAdminAtt);
        try { localStorage.setItem('texflow_adminAttendances', JSON.stringify(mergedAdminAtt)); } catch {}

        // 6. SAFE MERGE ATTENDANCES
        const localAtt = getLocalData<Attendance[]>('texflow_attendances', []);
        const attMap = new Map<string, Attendance>();
        localAtt.forEach(a => attMap.set(a.attendanceId, a));
        (fbAtt || []).forEach(a => attMap.set(a.attendanceId, a));
        const mergedAtt = Array.from(attMap.values());
        setAttendances(mergedAtt);
        try { localStorage.setItem('texflow_attendances', JSON.stringify(mergedAtt)); } catch {}

        // 7. SAFE MERGE SALARIES
        const localSalaries = getLocalData<Salary[]>('texflow_salaries', []);
        const salMap = new Map<string, Salary>();
        localSalaries.forEach(s => salMap.set(s.salaryId, s));
        (fbSalaries || []).forEach(s => salMap.set(s.salaryId, s));
        const mergedSalaries = Array.from(salMap.values());
        setSalaries(mergedSalaries);
        try { localStorage.setItem('texflow_salaries', JSON.stringify(mergedSalaries)); } catch {}

        // Only push initial seed state if ALL fetches succeeded AND remote DB is genuinely empty
        const allFetchesOk = fetchResults.every(r => r.ok);
        const totalCloudCount = (fbCompanies?.length || 0) + (fbWorkers?.length || 0) + (fbMachines?.length || 0) +
                               (fbWorks?.length || 0) + (fbAdminAtt?.length || 0) +
                               (fbAtt?.length || 0) + (fbSalaries?.length || 0);

        if (allFetchesOk && totalCloudCount === 0 && (mergedCompanies.length > 0 || mergedWorkers.length > 0)) {
          await syncLocalMissingToFirebase({
            companies: mergedCompanies,
            workers: mergedWorkers,
            machines: mergedMachines,
            dailyWorks: mergedWorks,
            adminAttendances: mergedAdminAtt,
            attendances: mergedAtt,
            salaries: mergedSalaries
          }).catch(err => console.warn('Initial additive seed sync notice:', err));
        }

        // ==========================================
        // REAL-TIME FIRESTORE SUBSCRIPTIONS (LIVE MULTI-VIEW & MOBILE SYNC)
        // ==========================================
        const handleSubError = (err: Error) => {
          setCloudStatus('error');
          setCloudMsg(`Live sync warning: ${err.message}`);
        };

        const unsubComp = subscribeFirebaseCompanies((liveComp) => {
          setCompanies(liveComp);
          try { localStorage.setItem('texflow_companies', JSON.stringify(liveComp)); } catch {}
        }, handleSubError);

        const unsubW = subscribeFirebaseWorkers((liveWorkers) => {
          setWorkers(liveWorkers);
          try { localStorage.setItem('texflow_workers', JSON.stringify(liveWorkers)); } catch {}
        }, handleSubError);

        const unsubM = subscribeFirebaseMachines((liveMachines) => {
          setMachines(liveMachines);
          try { localStorage.setItem('texflow_machines', JSON.stringify(liveMachines)); } catch {}
        }, handleSubError);

        const unsubDW = subscribeFirebaseDailyWorks((liveWorks) => {
          setDailyWorks(liveWorks);
          try { localStorage.setItem('texflow_dailyWorks', JSON.stringify(liveWorks)); } catch {}
        }, handleSubError);

        const unsubAA = subscribeFirebaseAdminAttendances((liveAdminAtt) => {
          setAdminAttendances(liveAdminAtt);
          try { localStorage.setItem('texflow_adminAttendances', JSON.stringify(liveAdminAtt)); } catch {}
        }, handleSubError);

        const unsubA = subscribeFirebaseAttendances((liveAtt) => {
          setAttendances(liveAtt);
          try { localStorage.setItem('texflow_attendances', JSON.stringify(liveAtt)); } catch {}
        }, handleSubError);

        const unsubS = subscribeFirebaseSalaries((liveSal) => {
          setSalaries(liveSal);
          try { localStorage.setItem('texflow_salaries', JSON.stringify(liveSal)); } catch {}
        }, handleSubError);

        unsubs.push(unsubComp, unsubW, unsubM, unsubDW, unsubAA, unsubA, unsubS);

      } catch (err: any) {
        setCloudStatus('error');
        setCloudMsg(`Firebase sync notice: ${formatCloudError(err)}. Running on local storage.`);
      }
    }

    initData();

    return () => {
      unsubs.forEach(fn => {
        try { fn(); } catch {}
      });
    };
  }, []);

  const handleManualSyncAll = async () => {
    setIsSyncing(true);
    try {
      // Safe non-destructive additive sync: pushes any unsynced local records
      // without ever deleting remote records created by other users/devices.
      await syncLocalMissingToFirebase({
        companies,
        workers,
        machines,
        dailyWorks,
        adminAttendances,
        attendances,
        salaries
      });

      const [liveComp, liveWorkers, liveMachines, liveWorks, liveAdminAtt, liveAtt, liveSal] = await Promise.all([
        fetchFirebaseCompanies(),
        fetchFirebaseWorkers(),
        fetchFirebaseMachines(),
        fetchFirebaseDailyWorks(),
        fetchFirebaseAdminAttendances(),
        fetchFirebaseAttendances(),
        fetchFirebaseSalaries()
      ]);

      setCompanies(liveComp);
      setWorkers(liveWorkers);
      setMachines(liveMachines);
      setDailyWorks(liveWorks);
      setAdminAttendances(liveAdminAtt);
      setAttendances(liveAtt);
      setSalaries(liveSal);

      const conn = await testFirebaseConnection();
      if (conn.success) {
        setCloudStatus('connected');
        setCloudMsg('Data safely synced with Firebase Firestore (zero remote overwrites).');
        showToast('success', 'Cloud data synchronized safely across all collections.');
      } else {
        setCloudStatus('error');
        setCloudMsg(conn.message);
        showToast('warning', conn.message);
      }
    } catch (err: any) {
      const msg = formatCloudError(err);
      setCloudStatus('error');
      setCloudMsg(`Sync Error: ${msg}`);
      showToast('error', `Firebase Sync Error: ${msg}`);
    } finally {
      setIsSyncing(false);
    }
  };

  // --- Batch Import Workers Handler (Zero Data Loss for Excel Uploads) ---
  const handleBatchImportWorkers = async (importedWorkers: Worker[]) => {
    try {
      await batchSaveWorkers(importedWorkers);
      setWorkers(prev => {
        const workerMap = new Map<string, Worker>();
        prev.forEach(w => workerMap.set(w.workerId.toLowerCase(), w));
        importedWorkers.forEach(w => workerMap.set(w.workerId.toLowerCase(), w));
        const merged = Array.from(workerMap.values());
        try { localStorage.setItem('texflow_workers', JSON.stringify(merged)); } catch {}
        return merged;
      });
      setCloudStatus('connected');
      setCloudMsg(`All ${importedWorkers.length} employee records saved live to Firebase Firestore!`);
      showToast('success', `Imported ${importedWorkers.length} employee records to Firebase.`);
    } catch (err: any) {
      const msg = formatCloudError(err);
      showToast('error', `Failed to import employees: ${msg}`);
      throw new Error(msg);
    }
  };

  // --- Company Operations ---
  const handleAddCompany = async (name: string) => {
    const newCompany: Company = {
      companyId: `COMP-${Date.now()}`,
      name: name.trim()
    };
    try {
      await createCompany(newCompany);
      setCompanies(prev => prev.some(c => c.companyId === newCompany.companyId) ? prev : [...prev, newCompany]);
      showToast('success', `Company "${newCompany.name}" created.`);
    } catch (err: any) {
      const msg = formatCloudError(err);
      showToast('error', `Failed to add company: ${msg}`);
      throw new Error(msg);
    }
  };

  const handleUpdateCompany = async (companyId: string, newName: string) => {
    const oldComp = companies.find(c => c.companyId === companyId);
    if (!oldComp) return;
    const oldName = oldComp.name;
    const cleanNewName = newName.trim();

    try {
      await updateCompanyAtomic(companyId, oldName, cleanNewName);
      setCompanies(prev => prev.map(c => c.companyId === companyId ? { ...c, name: cleanNewName } : c));
      if (oldName !== cleanNewName) {
        setWorkers(prev => prev.map(w => w.companyName === oldName ? { ...w, companyName: cleanNewName } : w));
        setMachines(prev => prev.map(m => m.companyName === oldName ? { ...m, companyName: cleanNewName } : m));
      }
      showToast('success', `Company updated to "${cleanNewName}".`);
    } catch (err: any) {
      const msg = formatCloudError(err);
      showToast('error', `Failed to update company: ${msg}`);
      throw new Error(msg);
    }
  };

  const handleDeleteCompany = async (companyId: string) => {
    const comp = companies.find(c => c.companyId === companyId);
    if (!comp) return;

    const associatedWorkers = workers.filter(w => w.companyName === comp.name).length;
    const associatedMachines = machines.filter(m => m.companyName === comp.name).length;
    const msg = (associatedWorkers > 0 || associatedMachines > 0)
      ? `Warning: ${associatedWorkers} employees and ${associatedMachines} machines are registered under "${comp.name}". Deleting this company will NOT delete those workers/machines, but they will keep the old company label. Continue?`
      : `Are you sure you want to delete company "${comp.name}"?`;

    setDeleteCompanyConfirm({
      isOpen: true,
      companyId,
      message: msg
    });
  };

  const executeDeleteCompany = async () => {
    const companyId = deleteCompanyConfirm.companyId;
    setDeleteCompanyConfirm({ isOpen: false, companyId: '', message: '' });
    if (!companyId) return;
    try {
      await deleteCompany(companyId);
      setCompanies(prev => prev.filter(c => c.companyId !== companyId));
      showToast('success', 'Company deleted.');
    } catch (err: any) {
      showToast('error', `Failed to delete company: ${formatCloudError(err)}`);
    }
  };

  // --- Worker Operations ---
  const handleAddWorker = async (newWorker: Worker) => {
    try {
      await createWorker(newWorker);
      setWorkers(prev => {
        const exists = prev.some(w => w.workerId.toLowerCase() === newWorker.workerId.toLowerCase());
        const updated = exists
          ? prev.map(w => w.workerId.toLowerCase() === newWorker.workerId.toLowerCase() ? newWorker : w)
          : [...prev, newWorker];
        try { localStorage.setItem('texflow_workers', JSON.stringify(updated)); } catch {}
        return updated;
      });
      showToast('success', `Employee ${newWorker.workerId} - ${newWorker.name} saved.`);
    } catch (err: any) {
      const msg = formatCloudError(err);
      showToast('error', `Failed to save employee: ${msg}`);
      throw new Error(msg);
    }
  };

  const handleUpdateWorker = async (updatedWorker: Worker) => {
    try {
      await updateWorker(updatedWorker);
      setWorkers(prev => {
        const updated = prev.map(w => w.workerId.toLowerCase() === updatedWorker.workerId.toLowerCase() ? updatedWorker : w);
        try { localStorage.setItem('texflow_workers', JSON.stringify(updated)); } catch {}
        return updated;
      });
      showToast('success', `Updated ${updatedWorker.workerId} - ${updatedWorker.name}.`);
    } catch (err: any) {
      const msg = formatCloudError(err);
      showToast('error', `Failed to update employee: ${msg}`);
      throw new Error(msg);
    }
  };

  const handleDeleteWorker = async (workerId: string) => {
    try {
      await deleteWorkerCascade(workerId);
      setWorkers(prev => {
        const updated = prev.filter(w => w.workerId !== workerId);
        try { localStorage.setItem('texflow_workers', JSON.stringify(updated)); } catch {}
        return updated;
      });
      setDailyWorks(prev => prev.filter(dw => dw.workerId !== workerId));
      setAdminAttendances(prev => prev.filter(aa => aa.workerId !== workerId));
      setAttendances(prev => prev.filter(a => a.workerId !== workerId));
      setSalaries(prev => prev.filter(s => s.workerId !== workerId));
      showToast('success', `Deleted employee ${workerId} and related records atomically.`);
    } catch (err: any) {
      showToast('error', `Failed to delete employee: ${formatCloudError(err)}`);
    }
  };

  // --- Machine Operations ---
  const handleToggleMachine = async (machineId: string) => {
    const target = machines.find(m => m.machineId === machineId);
    if (!target) return;
    const updated = { ...target, isActive: !target.isActive };
    try {
      await updateMachine(updated);
      setMachines(prev => prev.map(m => m.machineId === machineId ? updated : m));
    } catch (err: any) {
      showToast('error', `Failed to update machine status: ${formatCloudError(err)}`);
    }
  };

  const handleUpdateMachine = async (updatedMachine: Machine) => {
    try {
      await updateMachine(updatedMachine);
      setMachines(prev => prev.map(m => m.machineId === updatedMachine.machineId ? updatedMachine : m));
      showToast('success', `Machine ${updatedMachine.machineId} updated.`);
    } catch (err: any) {
      const msg = formatCloudError(err);
      showToast('error', `Failed to update machine: ${msg}`);
      throw new Error(msg);
    }
  };

  const handleAddMachine = async (newMachine: Machine) => {
    try {
      await createMachine(newMachine);
      setMachines(prev => prev.some(m => m.machineId.toLowerCase() === newMachine.machineId.toLowerCase()) ? prev : [...prev, newMachine]);
      showToast('success', `Machine ${newMachine.machineId} added.`);
    } catch (err: any) {
      const msg = formatCloudError(err);
      showToast('error', `Failed to add machine: ${msg}`);
      throw new Error(msg);
    }
  };

  const handleDeleteMachine = async (machineId: string) => {
    try {
      await deleteMachine(machineId);
      setMachines(prev => prev.filter(m => m.machineId !== machineId));
      showToast('success', `Machine ${machineId} deleted.`);
    } catch (err: any) {
      showToast('error', `Failed to delete machine: ${formatCloudError(err)}`);
    }
  };

  // --- Daily Work Operations (Transactional Conflict Guard) ---
  const handleAddDailyWork = async (newWork: DailyWork) => {
    try {
      const saved = await createDailyWorkAtomic(newWork);
      setDailyWorks(prev => prev.some(dw => dw.workId === saved.workId) ? prev : [...prev, saved]);
    } catch (err: any) {
      const msg = formatCloudError(err);
      showToast('error', msg);
      throw new Error(msg);
    }
  };

  const handleDeleteDailyWork = async (workId: string) => {
    try {
      await deleteDailyWork(workId);
      setDailyWorks(prev => prev.filter(dw => dw.workId !== workId));
      showToast('success', 'Production log deleted.');
    } catch (err: any) {
      showToast('error', `Failed to delete production log: ${formatCloudError(err)}`);
    }
  };

  // --- Admin & Other Attendance Operations (Deterministic + Batch) ---
  const handleAddAdminAttendance = async (newAtt: AdminAttendance) => {
    try {
      const saved = await saveAdminAttendanceAtomic(newAtt);
      setAdminAttendances(prev => {
        const exists = prev.some(a => a.adminAttendanceId === saved.adminAttendanceId);
        return exists
          ? prev.map(a => a.adminAttendanceId === saved.adminAttendanceId ? saved : a)
          : [...prev, saved];
      });
    } catch (err: any) {
      const msg = formatCloudError(err);
      showToast('error', `Failed to save attendance: ${msg}`);
      throw new Error(msg);
    }
  };

  const handleBatchAdminAttendance = async (records: AdminAttendance[]) => {
    try {
      const savedList = await batchSaveAdminAttendances(records);
      setAdminAttendances(prev => {
        const map = new Map<string, AdminAttendance>();
        prev.forEach(a => map.set(a.adminAttendanceId, a));
        savedList.forEach(a => map.set(a.adminAttendanceId, a));
        return Array.from(map.values());
      });
    } catch (err: any) {
      const msg = formatCloudError(err);
      showToast('error', `Failed to save bulk attendance: ${msg}`);
      throw new Error(msg);
    }
  };

  const handleDeleteAdminAttendance = async (id: string) => {
    try {
      await deleteAdminAttendance(id);
      setAdminAttendances(prev => prev.filter(a => a.adminAttendanceId !== id));
      showToast('success', 'Attendance log deleted.');
    } catch (err: any) {
      showToast('error', `Failed to delete attendance log: ${formatCloudError(err)}`);
    }
  };

  // --- Loom Attendance Operations ---
  const handleAddAttendance = async (newAtt: Attendance) => {
    try {
      await createAttendance(newAtt);
      setAttendances(prev => {
        const exists = prev.some(a => a.attendanceId === newAtt.attendanceId);
        return exists
          ? prev.map(a => a.attendanceId === newAtt.attendanceId ? newAtt : a)
          : [...prev, newAtt];
      });
    } catch (err: any) {
      const msg = formatCloudError(err);
      showToast('error', `Failed to save attendance: ${msg}`);
      throw new Error(msg);
    }
  };

  const handleDeleteAttendance = async (id: string) => {
    try {
      await deleteAttendance(id);
      setAttendances(prev => prev.filter(a => a.attendanceId !== id));
      showToast('success', 'Attendance deleted.');
    } catch (err: any) {
      showToast('error', `Failed to delete attendance: ${formatCloudError(err)}`);
    }
  };

  // --- Salary Operations (Transactional Update) ---
  const handleUpdateSalary = async (updatedSalary: Salary) => {
    try {
      await createSalary(updatedSalary);
      setSalaries(prev => {
        const exists = prev.some(s => s.salaryId === updatedSalary.salaryId);
        return exists
          ? prev.map(s => s.salaryId === updatedSalary.salaryId ? updatedSalary : s)
          : [...prev, updatedSalary];
      });
    } catch (err: any) {
      const msg = formatCloudError(err);
      showToast('error', `Salary update failed: ${msg}`);
      throw new Error(msg);
    }
  };

  // --- Backup and Reset Operations ---
  const handleExportBackup = () => {
    const data = {
      companies,
      workers,
      machines,
      dailyWorks,
      adminAttendances,
      attendances,
      salaries,
      exportVersion: '2.0',
      exportTime: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `texflow_factory_backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('success', 'Complete JSON backup (including companies) exported.');
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const imported = JSON.parse(event.target?.result as string);
        if (imported && (Array.isArray(imported.workers) || Array.isArray(imported.machines) || Array.isArray(imported.dailyWorks) || Array.isArray(imported.salaries))) {
          setIsSyncing(true);
          const impCompanies = Array.isArray(imported.companies) ? imported.companies : companies;
          const impWorkers = Array.isArray(imported.workers) ? imported.workers : [];
          const impMachines = Array.isArray(imported.machines) ? imported.machines : [];
          const impDailyWorks = Array.isArray(imported.dailyWorks) ? imported.dailyWorks : [];
          const impAdminAtt = Array.isArray(imported.adminAttendances) ? imported.adminAttendances : [];
          const impAtt = Array.isArray(imported.attendances) ? imported.attendances : [];
          const impSalaries = Array.isArray(imported.salaries) ? imported.salaries : [];

          await Promise.all([
            reconcileCompaniesToFirebase(impCompanies),
            reconcileWorkersToFirebase(impWorkers),
            reconcileMachinesToFirebase(impMachines),
            reconcileDailyWorksToFirebase(impDailyWorks),
            reconcileAdminAttendancesToFirebase(impAdminAtt),
            reconcileAttendancesToFirebase(impAtt),
            reconcileSalariesToFirebase(impSalaries)
          ]);

          setCompanies(impCompanies);
          setWorkers(impWorkers);
          setMachines(impMachines);
          setDailyWorks(impDailyWorks);
          setAdminAttendances(impAdminAtt);
          setAttendances(impAtt);
          setSalaries(impSalaries);

          showToast('success', 'Database restored successfully and synced with Firebase Firestore.');
        } else {
          showToast('error', 'Invalid backup file format. Core fields missing.');
        }
      } catch (err: any) {
        showToast('error', 'Error restoring backup file: ' + formatCloudError(err));
      } finally {
        setIsSyncing(false);
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleResetToSeed = () => {
    setIsConfirmResetOpen(true);
  };

  const executeResetToSeed = async () => {
    setIsSyncing(true);
    try {
      // Download safety backup automatically before destructive seed reset
      handleExportBackup();
      await Promise.all([
        reconcileCompaniesToFirebase(DEFAULT_COMPANIES),
        reconcileWorkersToFirebase(SEED_WORKERS),
        reconcileMachinesToFirebase(DEFAULT_MACHINES),
        reconcileDailyWorksToFirebase(SEED_DAILY_WORK),
        reconcileAdminAttendancesToFirebase(SEED_ADMIN_ATTENDANCE),
        reconcileAttendancesToFirebase(SEED_LOOM_ATTENDANCE),
        reconcileSalariesToFirebase(SEED_SALARIES)
      ]);

      setCompanies(DEFAULT_COMPANIES);
      setWorkers(SEED_WORKERS);
      setMachines(DEFAULT_MACHINES);
      setDailyWorks(SEED_DAILY_WORK);
      setAdminAttendances(SEED_ADMIN_ATTENDANCE);
      setAttendances(SEED_LOOM_ATTENDANCE);
      setSalaries(SEED_SALARIES);

      showToast('success', 'Database reset to demo dataset (safety backup downloaded).');
    } catch (err: any) {
      showToast('error', 'Error resetting database: ' + formatCloudError(err));
    } finally {
      setIsSyncing(false);
      setIsConfirmResetOpen(false);
    }
  };

  const executeClearAllData = async () => {
    setIsSyncing(true);
    try {
      // Download safety backup automatically before destructive clear
      handleExportBackup();
      await Promise.all([
        reconcileWorkersToFirebase([]),
        reconcileMachinesToFirebase(DEFAULT_MACHINES),
        reconcileDailyWorksToFirebase([]),
        reconcileAdminAttendancesToFirebase([]),
        reconcileAttendancesToFirebase([]),
        reconcileSalariesToFirebase([])
      ]);

      setWorkers([]);
      setMachines(DEFAULT_MACHINES);
      setDailyWorks([]);
      setAdminAttendances([]);
      setAttendances([]);
      setSalaries([]);

      try {
        localStorage.setItem('texflow_workers', JSON.stringify([]));
        localStorage.setItem('texflow_machines', JSON.stringify(DEFAULT_MACHINES));
        localStorage.setItem('texflow_dailyWorks', JSON.stringify([]));
        localStorage.setItem('texflow_adminAttendances', JSON.stringify([]));
        localStorage.setItem('texflow_attendances', JSON.stringify([]));
        localStorage.setItem('texflow_salaries', JSON.stringify([]));
      } catch (e) {
        console.warn('LocalStorage clear error:', e);
      }

      showToast('success', 'All factory data cleared (safety backup downloaded).');
    } catch (err: any) {
      showToast('error', 'Error clearing data: ' + formatCloudError(err));
    } finally {
      setIsSyncing(false);
      setIsConfirmClearDataOpen(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50 text-slate-800 antialiased font-sans">
      
      {/* Mobile Top Header */}
      <header className="md:hidden bg-slate-900 text-white px-5 py-4 flex justify-between items-center z-40 border-b border-slate-800 no-print">
        <div className="flex items-center gap-2">
          <Factory className="h-6 w-6 text-indigo-400" />
          <span className="font-display font-bold tracking-tight text-base text-white">TexFlow <span className="text-indigo-400 font-light">ERP</span></span>
        </div>
        <div className="flex items-center gap-2">
          {currentSession && (
            <button
              onClick={handleLogout}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 hover:text-white rounded-lg border border-slate-700 flex items-center gap-1 cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5 text-rose-400" />
              <span>{isAdmin ? 'Admin' : isSupervisor1 ? 'Supervisor 1' : isSupervisor2 ? 'Supervisor 2' : 'Staff'}</span>
            </button>
          )}
          <button 
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-300 transition-colors"
          >
            {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </header>

      {/* Sidebar navigation panel */}
      <aside className={`w-72 bg-slate-900 text-slate-200 flex flex-col justify-between border-r border-slate-800 z-30 no-print 
        fixed md:relative inset-y-0 left-0 transform md:translate-x-0 transition-transform duration-200 ease-in-out
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        {/* Core Sidebar Header & User Profile */}
        <div className="p-5 border-b border-slate-800 space-y-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-xl">
              <Factory className="h-6 w-6" />
            </div>
            <div>
              <h1 className="font-display font-bold tracking-tight text-white text-lg">TexFlow <span className="text-indigo-400 font-light font-sans text-base">ERP</span></h1>
              <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-widest mt-0.5">
                {isSupervisor1 ? 'Loom Production Portal' : isSupervisor2 ? 'Other Attendance Portal' : 'Textile Management System'}
              </p>
            </div>
          </div>

          {/* Active User Account Card */}
          <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700/80 flex items-center justify-between">
            <div className="flex items-center gap-2 overflow-hidden">
              <div className={`p-1.5 rounded-lg shrink-0 ${
                isAdmin 
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                  : isSupervisor1
                  ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                  : isSupervisor2
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  : 'bg-slate-700/50 text-slate-300 border border-slate-600'
              }`}>
                {isAdmin ? <ShieldCheck className="h-4 w-4" /> : <User className="h-4 w-4" />}
              </div>
              <div className="overflow-hidden">
                <p className="text-xs font-bold text-white truncate">
                  {currentSession ? currentSession.displayName : 'Not Logged In'}
                </p>
                <p className="text-[10px] font-bold tracking-wider uppercase text-slate-400">
                  {isAdmin && '🛡️ Admin (Full Access)'}
                  {isSupervisor1 && '⚡ Loom Production Only'}
                  {isSupervisor2 && '📋 Other Attendance Only'}
                  {currentSession?.role === 'staff' && '👤 Staff (No Delete)'}
                  {!currentSession && 'Guest'}
                </p>
              </div>
            </div>

            <button
              onClick={handleLogout}
              title="Logout / Switch User"
              className="p-1.5 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer shrink-0"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Tab Links - Filtered by role: Supervisor1 sees only Loom, Supervisor2 sees only Other Attendance */}
        <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: <Cpu className="h-4.5 w-4.5" /> },
            { id: 'directory', label: 'Employees Directory', icon: <Users className="h-4.5 w-4.5" /> },
            { id: 'production', label: 'Loom Production', icon: <LoomIcon className="h-4.5 w-4.5" /> },
            { id: 'admin-att', label: 'Admin attendance', icon: <Building className="h-4.5 w-4.5" /> },
            { id: 'other-att', label: 'Other Attendance', icon: <Users className="h-4.5 w-4.5 text-amber-400" /> },
            { id: 'salary', label: 'Monthly Salary ledger', icon: <FileText className="h-4.5 w-4.5" /> },
            { id: 'machines', label: 'Loom machines', icon: <Cpu className="h-4.5 w-4.5 text-indigo-400" /> },
            { id: 'loom-reports', label: 'Reports', icon: <FileText className="h-4.5 w-4.5 text-emerald-400" /> }
          ]
            .filter((tab) => {
              if (isSupervisor1) return tab.id === 'production';
              if (isSupervisor2) return tab.id === 'other-att';
              return true;
            })
            .map((tab) => {
              const isSelected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  id={`sidebar-tab-${tab.id}`}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                    isSelected 
                      ? 'bg-indigo-600/20 text-indigo-400 font-semibold shadow-sm' 
                      : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              );
            })}
        </nav>

        {/* Sidebar Footer - Settings & Controls Quick Button (Admin Only) */}
        {isAdmin && (
          <div className="p-4 border-t border-slate-800 bg-slate-900/60">
            <button
              type="button"
              id="open-settings-footer-btn"
              onClick={() => {
                setActiveTab('settings');
                setIsMobileMenuOpen(false);
              }}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer border shadow-xs group ${
                activeTab === 'settings'
                  ? 'bg-indigo-600 text-white border-indigo-500'
                  : 'bg-slate-800 hover:bg-slate-750 text-slate-200 hover:text-white border-slate-700/80'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Settings className={`h-4 w-4 ${activeTab === 'settings' ? 'text-white' : 'text-indigo-400'} group-hover:rotate-45 transition-transform duration-200`} />
                <span>Settings & Controls</span>
              </div>
              <div className="flex items-center gap-1.5">
                {cloudStatus === 'connected' ? (
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                ) : (
                  <span className="inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                )}
              </div>
            </button>
          </div>
        )}

      </aside>

      {/* Main workspace frame */}
      <main className="flex-1 p-4 sm:p-8 overflow-y-auto max-h-[100vh] w-full">
        
        {/* Tab content switcher */}
        <div className="max-w-7xl mx-auto space-y-6">
          {/* SUPERVISOR 1 STRICT VIEW: LOOM PRODUCTION ONLY */}
          {isSupervisor1 ? (
            <LoomDailyWork
              workers={workers}
              machines={machines}
              companies={companies}
              dailyWorks={dailyWorks}
              onAddDailyWork={handleAddDailyWork}
              onDeleteDailyWork={handleDeleteDailyWork}
              isAdmin={false}
              isSupervisor1={true}
            />
          ) : isSupervisor2 ? (
            /* SUPERVISOR 2 STRICT VIEW: OTHER ATTENDANCE ONLY */
            <OtherAttendanceRegister
              workers={workers}
              adminAttendances={adminAttendances}
              onAddAdminAttendance={handleAddAdminAttendance}
              onBatchAdminAttendance={handleBatchAdminAttendance}
              onDeleteAdminAttendance={handleDeleteAdminAttendance}
              isAdmin={false}
              isSupervisor2={true}
            />
          ) : (
            /* ADMIN AND GENERAL USERS VIEW */
            <>
              {activeTab === 'dashboard' && (
                <DashboardOverview
                  workers={workers}
                  machines={machines}
                  dailyWorks={dailyWorks}
                  adminAttendances={adminAttendances}
                  salaries={salaries}
                  onNavigateToTab={(tab) => setActiveTab(tab)}
                />
              )}

              {activeTab === 'directory' && (
                <WorkersDirectory
                  workers={workers}
                  companies={companies}
                  onAddWorker={handleAddWorker}
                  onUpdateWorker={handleUpdateWorker}
                  onDeleteWorker={handleDeleteWorker}
                  onBatchImportWorkers={handleBatchImportWorkers}
                  isAdmin={isAdmin}
                />
              )}

              {activeTab === 'production' && (
                <LoomDailyWork
                  workers={workers}
                  machines={machines}
                  companies={companies}
                  dailyWorks={dailyWorks}
                  onAddDailyWork={handleAddDailyWork}
                  onDeleteDailyWork={handleDeleteDailyWork}
                  isAdmin={isAdmin}
                  isSupervisor1={isSupervisor1}
                />
              )}

              {activeTab === 'admin-att' && (
                <AdminAttendanceRegister
                  workers={workers}
                  adminAttendances={adminAttendances}
                  onAddAdminAttendance={handleAddAdminAttendance}
                  onBatchAdminAttendance={handleBatchAdminAttendance}
                  onDeleteAdminAttendance={handleDeleteAdminAttendance}
                  isAdmin={isAdmin}
                />
              )}

              {activeTab === 'other-att' && (
                <OtherAttendanceRegister
                  workers={workers}
                  adminAttendances={adminAttendances}
                  onAddAdminAttendance={handleAddAdminAttendance}
                  onBatchAdminAttendance={handleBatchAdminAttendance}
                  onDeleteAdminAttendance={handleDeleteAdminAttendance}
                  isAdmin={isAdmin}
                  isSupervisor2={isSupervisor2}
                />
              )}

              {activeTab === 'salary' && (
                <MonthlySalarySheet
                  workers={workers}
                  companies={companies}
                  salaries={salaries}
                  dailyWorks={dailyWorks}
                  adminAttendances={adminAttendances}
                  attendances={attendances}
                  onUpdateSalary={handleUpdateSalary}
                />
              )}

              {activeTab === 'machines' && (
                <MachineRegistry
                  machines={machines}
                  companies={companies}
                  onToggleMachine={handleToggleMachine}
                  onAddMachine={handleAddMachine}
                  onUpdateMachine={handleUpdateMachine}
                  onDeleteMachine={handleDeleteMachine}
                  isAdmin={isAdmin}
                />
              )}

              {activeTab === 'loom-reports' && (
                <LoomReportsRegister
                  workers={workers}
                  dailyWorks={dailyWorks}
                  adminAttendances={adminAttendances}
                  attendances={attendances}
                  machines={machines}
                  companies={companies}
                />
              )}

              {activeTab === 'settings' && isAdmin && (
                <SettingsPanel
                  companies={companies}
                  workers={workers}
                  onAddCompany={handleAddCompany}
                  onUpdateCompany={handleUpdateCompany}
                  onDeleteCompany={handleDeleteCompany}
                  cloudStatus={cloudStatus}
                  cloudMsg={cloudMsg}
                  firebaseProjectId={FIREBASE_PROJECT_ID}
                  isSyncing={isSyncing}
                  onManualSyncAll={handleManualSyncAll}
                  onShowDbInfo={() => setShowDbModal(true)}
                  onExportBackup={handleExportBackup}
                  onImportBackup={handleImportBackup}
                  onOpenClearDataModal={() => setIsConfirmClearDataOpen(true)}
                  onResetToSeed={handleResetToSeed}
                  onInstallDesktopApp={handleInstallClick}
                  onShowInstallGuide={() => setShowInstallGuide(true)}
                  isAdmin={isAdmin}
                />
              )}
            </>
          )}
        </div>

      </main>

      {/* Authentication Modal */}
      <LoginModal
        isOpen={isLoginModalOpen}
        currentSession={currentSession}
        onClose={() => {
          if (currentSession) {
            setIsLoginModalOpen(false);
          }
        }}
        onLoginSuccess={(session) => {
          try {
            localStorage.setItem('texflow_auth_session', JSON.stringify(session));
          } catch {}
          setCurrentSession(session);
          setIsLoginModalOpen(false);
          if (session.role === 'supervisor1') {
            setActiveTab('production');
          } else if (session.role === 'supervisor2') {
            setActiveTab('other-att');
          } else {
            setActiveTab('dashboard');
          }
        }}
      />

      {isConfirmResetOpen && (
        <ConfirmModal
          isOpen={isConfirmResetOpen}
          title="Reset Demo Dataset"
          message="Are you sure you want to reset all data? A safety JSON backup will download automatically before replacing records with the demo seed dataset."
          confirmLabel="Reset"
          type="warning"
          onConfirm={executeResetToSeed}
          onCancel={() => setIsConfirmResetOpen(false)}
        />
      )}

      {deleteCompanyConfirm.isOpen && (
        <ConfirmModal
          isOpen={deleteCompanyConfirm.isOpen}
          title="Delete Company"
          message={deleteCompanyConfirm.message}
          confirmLabel="Delete Company"
          type="danger"
          onConfirm={executeDeleteCompany}
          onCancel={() => setDeleteCompanyConfirm({ isOpen: false, companyId: '', message: '' })}
        />
      )}

      {isConfirmClearDataOpen && (
        <ClearDataModal
          isOpen={isConfirmClearDataOpen}
          onClose={() => setIsConfirmClearDataOpen(false)}
          onConfirmClear={executeClearAllData}
        />
      )}

      {/* Non-blocking System Notification Toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-4 right-4 z-[60] max-w-md px-4 py-3 rounded-xl shadow-2xl border flex items-center gap-3 text-xs font-bold animate-in fade-in slide-in-from-bottom-2 duration-150 ${
            toast.type === 'success'
              ? 'bg-emerald-950 text-emerald-100 border-emerald-700'
              : toast.type === 'warning'
              ? 'bg-amber-950 text-amber-100 border-amber-700'
              : 'bg-rose-950 text-rose-100 border-rose-700'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className={`h-4 w-4 shrink-0 ${toast.type === 'warning' ? 'text-amber-400' : 'text-rose-400'}`} />
          )}
          <span className="leading-snug flex-1">{toast.message}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="p-1 hover:bg-white/10 rounded-lg transition-colors cursor-pointer shrink-0"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* PWA Windows Installation Guide Modal */}
      {showInstallGuide && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs flex justify-center items-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-indigo-50/50">
              <div className="flex items-center gap-2.5">
                <Laptop className="h-5.5 w-5.5 text-indigo-600" />
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Install TexFlow Windows App</h3>
                  <p className="text-[11px] text-indigo-600 font-bold">Easy way to install app on desktop</p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setShowInstallGuide(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
              {/* Critical Notice: Standalone link */}
              <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl space-y-2">
                <p className="text-xs font-extrabold text-amber-800 uppercase tracking-wider flex items-center gap-1.5">
                  ⚠️ Step 1: Open in New Tab
                </p>
                <p className="text-xs text-amber-950 font-semibold leading-relaxed">
                  If you are viewing this app inside the Google AI Studio preview window, please click the button below to open it in a full new tab first.
                </p>
                <a
                  href="https://ais-pre-565kt2wlwierafhv7gmnps-1026129663129.asia-southeast1.run.app"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-extrabold rounded-lg text-xs shadow-xs transition-colors mt-1"
                >
                  Open in New Tab
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </a>
              </div>

              {/* Install guide */}
              <div className="space-y-4">
                <p className="text-xs font-extrabold text-slate-600 uppercase tracking-wider">
                  Step 2: Installation in Browser
                </p>

                {/* Google Chrome */}
                <div className="flex gap-3.5 p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="p-2 bg-white rounded-lg border border-slate-200 h-fit text-amber-500">
                    <Chrome className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold text-slate-800">How to install in Google Chrome:</h4>
                    <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
                      1. Look at the right side of the address bar for the <strong>Install / Computer with down arrow icon</strong> and click it.
                    </p>
                    <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
                      2. Or click the <strong>3 dots (...)</strong> on the top right, go to <strong>"Cast, save and share"</strong>, and click <strong>"Install page as app"</strong>.
                    </p>
                  </div>
                </div>

                {/* Microsoft Edge */}
                <div className="flex gap-3.5 p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="p-2 bg-white rounded-lg border border-slate-200 h-fit text-blue-500">
                    <Monitor className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold text-slate-800">How to install in Microsoft Edge:</h4>
                    <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
                      1. Click the <strong>"App available" (four boxes with plus icon)</strong> on the right of the address bar.
                    </p>
                    <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
                      2. Or click the <strong>3 dots (...)</strong> on top, go to <strong>"Apps"</strong>, and click <strong>"Install this site as an app"</strong>.
                    </p>
                  </div>
                </div>
              </div>

              {/* What happens next */}
              <div className="p-3.5 bg-indigo-50 rounded-xl text-indigo-950 space-y-1 text-xs">
                <p className="font-bold">Benefits of Desktop App:</p>
                <ul className="list-disc pl-4 space-y-0.5 text-[11px] font-medium text-indigo-900 leading-relaxed">
                  <li>Creates a <strong>Standalone Window</strong></li>
                  <li>Adds a <strong>Desktop Shortcut</strong> & Start Menu icon</li>
                  <li>Works super fast and is offline-ready!</li>
                </ul>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setShowInstallGuide(false)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl text-xs transition-colors cursor-pointer shadow-sm"
              >
                Got It, Thanks!
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Firebase Firestore Cloud Database Details Modal */}
      {showDbModal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs flex justify-center items-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-900 text-white">
              <div className="flex items-center gap-2.5">
                <Database className="h-5.5 w-5.5 text-amber-400" />
                <div>
                  <h3 className="font-bold text-white text-base">Firebase Firestore Cloud Database</h3>
                  <p className="text-[11px] text-amber-300 font-semibold">Active Real-Time Cloud Persistence</p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setShowDbModal(false)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto text-xs text-slate-700">
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-1.5 text-xs text-emerald-950">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold flex items-center gap-1.5 text-emerald-900 text-sm">
                    <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600" /> Cloud Database Connected
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300">
                    LIVE
                  </span>
                </div>
                <p className="text-emerald-800 text-xs">
                  All your data is continuously stored and backed up in Google Cloud Firestore. Page refreshes and browser restarts will never delete your employees or production logs.
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2.5">
                <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">Cloud Project Configuration</h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                    <span className="text-slate-400 block text-[10px] font-bold">PROJECT ID</span>
                    <span className="font-mono font-bold text-slate-800">{FIREBASE_PROJECT_ID}</span>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                    <span className="text-slate-400 block text-[10px] font-bold">DATABASE</span>
                    <span className="font-mono font-bold text-slate-800">(default) Firestore</span>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                    <span className="text-slate-400 block text-[10px] font-bold">SECURITY RULES</span>
                    <span className="font-bold text-emerald-600">Active & Deployed</span>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                    <span className="text-slate-400 block text-[10px] font-bold">DATA SAFETY</span>
                    <span className="font-bold text-indigo-600">Zero Data Loss Policy</span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2.5">
                <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">Current Database Statistics</h4>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="bg-white p-2 rounded-lg border border-slate-200">
                    <span className="text-slate-400 text-[10px] block font-bold">Employees</span>
                    <span className="text-base font-extrabold text-indigo-600">{workers.length}</span>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-slate-200">
                    <span className="text-slate-400 text-[10px] block font-bold">Companies</span>
                    <span className="text-base font-extrabold text-slate-800">{companies.length}</span>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-slate-200">
                    <span className="text-slate-400 text-[10px] block font-bold">Machines</span>
                    <span className="text-base font-extrabold text-slate-800">{machines.length}</span>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-slate-200">
                    <span className="text-slate-400 text-[10px] block font-bold">Daily Works</span>
                    <span className="text-base font-extrabold text-slate-800">{dailyWorks.length}</span>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-slate-200">
                    <span className="text-slate-400 text-[10px] block font-bold">Admin Att.</span>
                    <span className="text-base font-extrabold text-slate-800">{adminAttendances.length}</span>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-slate-200">
                    <span className="text-slate-400 text-[10px] block font-bold">Salary Records</span>
                    <span className="text-base font-extrabold text-slate-800">{salaries.length}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
              <button
                type="button"
                onClick={() => {
                  handleManualSyncAll();
                }}
                disabled={isSyncing}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{isSyncing ? 'Syncing...' : 'Sync All Records Now'}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowDbModal(false)}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                Close Window
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
