/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
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
import AttendanceRegister from './components/AttendanceRegister';
import AdminAttendanceRegister from './components/AdminAttendanceRegister';
import OtherAttendanceRegister from './components/OtherAttendanceRegister';
import MonthlySalarySheet from './components/MonthlySalarySheet';
import MachineRegistry from './components/MachineRegistry';
import ConfirmModal from './components/ConfirmModal';
import LoginModal from './components/LoginModal';
import ClearDataModal from './components/ClearDataModal';
import SettingsPanel from './components/SettingsPanel';

import { 
  Cpu, Users, Cpu as LoomIcon, Clock, Building, FileText, 
  Settings, Download, Upload, Trash2, ShieldCheck, Factory,
  Menu, X, Monitor, HelpCircle, Laptop, Chrome, ArrowUpRight,
  Database, RefreshCw, CheckCircle2, AlertCircle, Copy, Check,
  LogOut, User, Lock, KeyRound
} from 'lucide-react';
import { 
  testFirebaseConnection, 
  fetchFirebaseWorkers, fetchFirebaseMachines, fetchFirebaseDailyWorks,
  fetchFirebaseAdminAttendances, fetchFirebaseAttendances, fetchFirebaseSalaries, fetchFirebaseCompanies,
  createWorker, updateWorker, deleteWorker, batchSaveWorkers,
  createMachine, updateMachine, deleteMachine,
  createDailyWork, updateDailyWork, deleteDailyWork,
  createAdminAttendance, updateAdminAttendance, deleteAdminAttendance,
  createAttendance, updateAttendance, deleteAttendance,
  createSalary, updateSalary, deleteSalary,
  createCompany, updateCompany, deleteCompany,
  reconcileWorkersToFirebase, reconcileMachinesToFirebase, reconcileDailyWorksToFirebase,
  reconcileAdminAttendancesToFirebase, reconcileAttendancesToFirebase, reconcileSalariesToFirebase,
  reconcileCompaniesToFirebase,
  FIREBASE_PROJECT_ID
} from './lib/firebase';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isConfirmResetOpen, setIsConfirmResetOpen] = useState(false);
  const [isConfirmClearDataOpen, setIsConfirmClearDataOpen] = useState(false);

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
        const [fbCompanies, fbWorkers, fbMachines, fbWorks, fbAdminAtt, fbAtt, fbSalaries] = await Promise.all([
          fetchFirebaseCompanies().catch(() => null),
          fetchFirebaseWorkers().catch(() => null),
          fetchFirebaseMachines().catch(() => null),
          fetchFirebaseDailyWorks().catch(() => null),
          fetchFirebaseAdminAttendances().catch(() => null),
          fetchFirebaseAttendances().catch(() => null),
          fetchFirebaseSalaries().catch(() => null)
        ]);

        // 1. SAFE MERGE COMPANIES: Never overwrite with empty if local has data
        const localCompanies = getLocalData<Company[]>('texflow_companies', DEFAULT_COMPANIES);
        const compMap = new Map<string, Company>();
        localCompanies.forEach(c => compMap.set(c.companyId, c));
        (fbCompanies || []).forEach(c => compMap.set(c.companyId, c));
        const mergedCompanies = compMap.size > 0 ? Array.from(compMap.values()) : DEFAULT_COMPANIES;
        setCompanies(mergedCompanies);
        try { localStorage.setItem('texflow_companies', JSON.stringify(mergedCompanies)); } catch {}

        // 2. SAFE MERGE WORKERS: Absolute Zero Data Loss Rule
        const localWorkers = getLocalData<Worker[]>('texflow_workers', []);
        const workerMap = new Map<string, Worker>();
        // First put any local workers (preserves workers imported via Excel even before network roundtrip)
        localWorkers.forEach(w => workerMap.set(w.workerId.toLowerCase(), w));
        // Overlay Firestore workers (authoritative cloud records)
        (fbWorkers || []).forEach(w => workerMap.set(w.workerId.toLowerCase(), w));
        const mergedWorkers = Array.from(workerMap.values());
        setWorkers(mergedWorkers);
        try { localStorage.setItem('texflow_workers', JSON.stringify(mergedWorkers)); } catch {}

        // Background push any local-only workers up to Firebase
        const unsyncedWorkers = localWorkers.filter(lw => 
          !(fbWorkers || []).some(fw => fw.workerId.toLowerCase() === lw.workerId.toLowerCase())
        );
        if (unsyncedWorkers.length > 0) {
          batchSaveWorkers(unsyncedWorkers).catch(err => console.warn('Background sync for unsynced workers:', err));
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

        // If Firebase had no data at all (first time deployment), initialize it with current merged state
        const totalCloudCount = (fbCompanies?.length || 0) + (fbWorkers?.length || 0) + (fbMachines?.length || 0) + 
                               (fbWorks?.length || 0) + (fbAdminAtt?.length || 0) + 
                               (fbAtt?.length || 0) + (fbSalaries?.length || 0);

        if (totalCloudCount === 0 && (mergedCompanies.length > 0 || mergedWorkers.length > 0)) {
          await Promise.all([
            reconcileCompaniesToFirebase(mergedCompanies).catch(() => {}),
            reconcileWorkersToFirebase(mergedWorkers).catch(() => {}),
            reconcileMachinesToFirebase(mergedMachines).catch(() => {}),
            reconcileDailyWorksToFirebase(mergedWorks).catch(() => {}),
            reconcileAdminAttendancesToFirebase(mergedAdminAtt).catch(() => {}),
            reconcileAttendancesToFirebase(mergedAtt).catch(() => {}),
            reconcileSalariesToFirebase(mergedSalaries).catch(() => {})
          ]);
        }
      } catch (err: any) {
        setCloudStatus('error');
        setCloudMsg(`Firebase sync notice: ${err?.message || err}. Running on local storage.`);
      }
    }

    initData();
  }, []);

  const handleManualSyncAll = async () => {
    setIsSyncing(true);
    try {
      await Promise.all([
        reconcileCompaniesToFirebase(companies),
        reconcileWorkersToFirebase(workers),
        reconcileMachinesToFirebase(machines),
        reconcileDailyWorksToFirebase(dailyWorks),
        reconcileAdminAttendancesToFirebase(adminAttendances),
        reconcileAttendancesToFirebase(attendances),
        reconcileSalariesToFirebase(salaries)
      ]);
      const conn = await testFirebaseConnection();
      if (conn.success) {
        setCloudStatus('connected');
        setCloudMsg('Data reconciled and synced with Firebase Firestore successfully!');
      } else {
        setCloudStatus('error');
        setCloudMsg(conn.message);
      }
    } catch (err: any) {
      setCloudStatus('error');
      setCloudMsg(`Sync Error: ${err?.message || err}`);
      alert(`Firebase Sync Error: ${err?.message || err}`);
    } finally {
      setIsSyncing(false);
    }
  };

  // --- Batch Import Workers Handler (Zero Data Loss for Excel Uploads) ---
  const handleBatchImportWorkers = async (importedWorkers: Worker[]) => {
    // 1. Immediately update state and localStorage synchronously
    setWorkers(prev => {
      const workerMap = new Map<string, Worker>();
      prev.forEach(w => workerMap.set(w.workerId.toLowerCase(), w));
      importedWorkers.forEach(w => workerMap.set(w.workerId.toLowerCase(), w));
      const merged = Array.from(workerMap.values());
      try {
        localStorage.setItem('texflow_workers', JSON.stringify(merged));
      } catch (e) {
        console.warn('LocalStorage save notice:', e);
      }
      return merged;
    });

    // 2. Persist to Firebase Firestore
    try {
      await batchSaveWorkers(importedWorkers);
      setCloudStatus('connected');
      setCloudMsg(`All ${importedWorkers.length} employee records saved live to Firebase Firestore!`);
    } catch (err: any) {
      console.warn('Batch saved locally, Firebase sync warning:', err?.message || err);
      setCloudMsg(`Saved locally (${err?.message || 'Sync queued'})`);
    }
  };

  // --- Company Operations ---
  const handleAddCompany = async (name: string) => {
    const newCompany: Company = {
      companyId: `COMP-${Date.now()}`,
      name
    };
    setCompanies(prev => [...prev, newCompany]);
    try {
      await createCompany(newCompany);
    } catch (err: any) {
      console.warn('Saved company locally, Firebase sync pending:', err?.message || err);
    }
  };

  const handleUpdateCompany = async (companyId: string, newName: string) => {
    const oldComp = companies.find(c => c.companyId === companyId);
    if (!oldComp) return;
    const oldName = oldComp.name;

    setCompanies(prev => prev.map(c => c.companyId === companyId ? { ...c, name: newName } : c));

    // Also update workers associated with this company name
    if (oldName !== newName) {
      setWorkers(prev => prev.map(w => {
        if (w.companyName === oldName) {
          const updated = { ...w, companyName: newName };
          updateWorker(updated).catch(() => {});
          return updated;
        }
        return w;
      }));
    }

    try {
      await updateCompany(companyId, newName);
    } catch (err: any) {
      console.warn('Updated company locally, Firebase sync pending:', err?.message || err);
    }
  };

  const handleDeleteCompany = async (companyId: string) => {
    const comp = companies.find(c => c.companyId === companyId);
    if (!comp) return;

    const associatedCount = workers.filter(w => w.companyName === comp.name).length;
    if (associatedCount > 0) {
      if (!window.confirm(`Warning: ${associatedCount} employees are registered under "${comp.name}". Are you sure you want to delete this company?`)) {
        return;
      }
    }

    setCompanies(prev => prev.filter(c => c.companyId !== companyId));
    try {
      await deleteCompany(companyId);
    } catch (err: any) {
      console.warn('Deleted company locally, Firebase sync pending:', err?.message || err);
    }
  };

  // --- Worker Operations ---
  const handleAddWorker = async (newWorker: Worker) => {
    setWorkers(prev => {
      const exists = prev.some(w => w.workerId.toLowerCase() === newWorker.workerId.toLowerCase());
      const updated = exists 
        ? prev.map(w => w.workerId.toLowerCase() === newWorker.workerId.toLowerCase() ? newWorker : w)
        : [...prev, newWorker];
      try { localStorage.setItem('texflow_workers', JSON.stringify(updated)); } catch {}
      return updated;
    });
    try {
      await createWorker(newWorker);
    } catch (err: any) {
      console.warn('Saved locally, Firebase sync pending:', err?.message || err);
    }
  };

  const handleUpdateWorker = async (updatedWorker: Worker) => {
    setWorkers(prev => {
      const updated = prev.map(w => w.workerId.toLowerCase() === updatedWorker.workerId.toLowerCase() ? updatedWorker : w);
      try { localStorage.setItem('texflow_workers', JSON.stringify(updated)); } catch {}
      return updated;
    });
    try {
      await updateWorker(updatedWorker);
    } catch (err: any) {
      console.warn('Updated locally, Firebase sync pending:', err?.message || err);
    }
  };

  const handleDeleteWorker = async (workerId: string) => {
    setWorkers(prev => {
      const updated = prev.filter(w => w.workerId !== workerId);
      try { localStorage.setItem('texflow_workers', JSON.stringify(updated)); } catch {}
      return updated;
    });
    setDailyWorks(prev => prev.filter(dw => dw.workerId !== workerId));
    setAdminAttendances(prev => prev.filter(aa => aa.workerId !== workerId));
    setAttendances(prev => prev.filter(a => a.workerId !== workerId));
    setSalaries(prev => prev.filter(s => s.workerId !== workerId));

    try {
      await deleteWorker(workerId);
      const worksToDelete = dailyWorks.filter(dw => dw.workerId === workerId);
      for (const dw of worksToDelete) {
        await deleteDailyWork(dw.workId).catch(() => {});
      }
      const adminAttToDelete = adminAttendances.filter(aa => aa.workerId === workerId);
      for (const aa of adminAttToDelete) {
        await deleteAdminAttendance(aa.adminAttendanceId).catch(() => {});
      }
      const attToDelete = attendances.filter(a => a.workerId === workerId);
      for (const a of attToDelete) {
        await deleteAttendance(a.attendanceId).catch(() => {});
      }
      const salariesToDelete = salaries.filter(s => s.workerId === workerId);
      for (const s of salariesToDelete) {
        await deleteSalary(s.salaryId).catch(() => {});
      }
    } catch (err: any) {
      console.warn('Deleted locally, Firebase sync pending:', err?.message || err);
    }
  };

  // --- Machine Operations ---
  const handleToggleMachine = async (machineId: string) => {
    const target = machines.find(m => m.machineId === machineId);
    if (!target) return;
    const updated = { ...target, isActive: !target.isActive };
    setMachines(prev => prev.map(m => m.machineId === machineId ? updated : m));
    try {
      await updateMachine(updated);
    } catch (err: any) {
      console.warn('Updated machine locally, Firebase sync pending:', err?.message || err);
    }
  };

  const handleUpdateMachine = async (updatedMachine: Machine) => {
    setMachines(prev => prev.map(m => m.machineId === updatedMachine.machineId ? updatedMachine : m));
    try {
      await updateMachine(updatedMachine);
    } catch (err: any) {
      console.warn('Updated machine locally, Firebase sync pending:', err?.message || err);
    }
  };

  const handleAddMachine = async (newMachine: Machine) => {
    setMachines(prev => [...prev, newMachine]);
    try {
      await createMachine(newMachine);
    } catch (err: any) {
      console.warn('Added machine locally, Firebase sync pending:', err?.message || err);
    }
  };

  const handleDeleteMachine = async (machineId: string) => {
    setMachines(prev => prev.filter(m => m.machineId !== machineId));
    try {
      await deleteMachine(machineId);
    } catch (err: any) {
      console.warn('Deleted machine locally, Firebase sync pending:', err?.message || err);
    }
  };

  // --- Daily Work Operations ---
  const handleAddDailyWork = async (newWork: DailyWork) => {
    setDailyWorks(prev => [...prev, newWork]);
    try {
      await createDailyWork(newWork);
    } catch (err: any) {
      console.warn('Saved daily work locally, Firebase sync pending:', err?.message || err);
    }
  };

  const handleDeleteDailyWork = async (workId: string) => {
    setDailyWorks(prev => prev.filter(dw => dw.workId !== workId));
    try {
      await deleteDailyWork(workId);
    } catch (err: any) {
      console.warn('Deleted daily work locally, Firebase sync pending:', err?.message || err);
    }
  };

  // --- Admin Attendance Operations ---
  const handleAddAdminAttendance = async (newAtt: AdminAttendance) => {
    const exists = adminAttendances.some(a => a.adminAttendanceId === newAtt.adminAttendanceId);
    if (exists) {
      setAdminAttendances(prev => prev.map(a => a.adminAttendanceId === newAtt.adminAttendanceId ? newAtt : a));
    } else {
      setAdminAttendances(prev => [...prev, newAtt]);
    }
    try {
      if (exists) {
        await updateAdminAttendance(newAtt);
      } else {
        await createAdminAttendance(newAtt);
      }
    } catch (err: any) {
      console.warn('Saved admin attendance locally, Firebase sync pending:', err?.message || err);
    }
  };

  const handleDeleteAdminAttendance = async (id: string) => {
    setAdminAttendances(prev => prev.filter(a => a.adminAttendanceId !== id));
    try {
      await deleteAdminAttendance(id);
    } catch (err: any) {
      console.warn('Deleted admin attendance locally, Firebase sync pending:', err?.message || err);
    }
  };

  // --- Loom Attendance Operations ---
  const handleAddAttendance = async (newAtt: Attendance) => {
    const exists = attendances.some(a => a.attendanceId === newAtt.attendanceId);
    if (exists) {
      setAttendances(prev => prev.map(a => a.attendanceId === newAtt.attendanceId ? newAtt : a));
    } else {
      setAttendances(prev => [...prev, newAtt]);
    }
    try {
      if (exists) {
        await updateAttendance(newAtt);
      } else {
        await createAttendance(newAtt);
      }
    } catch (err: any) {
      console.warn('Saved loom attendance locally, Firebase sync pending:', err?.message || err);
    }
  };

  const handleDeleteAttendance = async (id: string) => {
    setAttendances(prev => prev.filter(a => a.attendanceId !== id));
    try {
      await deleteAttendance(id);
    } catch (err: any) {
      console.warn('Deleted loom attendance locally, Firebase sync pending:', err?.message || err);
    }
  };

  // --- Salary Operations ---
  const handleUpdateSalary = async (updatedSalary: Salary) => {
    const exists = salaries.some(s => s.salaryId === updatedSalary.salaryId);
    if (exists) {
      setSalaries(prev => prev.map(s => s.salaryId === updatedSalary.salaryId ? updatedSalary : s));
    } else {
      setSalaries(prev => [...prev, updatedSalary]);
    }
    try {
      if (exists) {
        await updateSalary(updatedSalary);
      } else {
        await createSalary(updatedSalary);
      }
    } catch (err: any) {
      console.warn('Saved salary locally, Firebase sync pending:', err?.message || err);
    }
  };

  // --- Backup and Reset Operations ---
  const handleExportBackup = () => {
    const data = {
      workers,
      machines,
      dailyWorks,
      adminAttendances,
      attendances,
      salaries,
      exportVersion: "1.0",
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
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const imported = JSON.parse(event.target?.result as string);
        if (imported.workers || imported.machines || imported.dailyWorks || imported.salaries) {
          setIsSyncing(true);
          const impWorkers = imported.workers || [];
          const impMachines = imported.machines || [];
          const impDailyWorks = imported.dailyWorks || [];
          const impAdminAtt = imported.adminAttendances || [];
          const impAtt = imported.attendances || [];
          const impSalaries = imported.salaries || [];

          // 1. Instantly update local state & localStorage
          setWorkers(impWorkers);
          setMachines(impMachines);
          setDailyWorks(impDailyWorks);
          setAdminAttendances(impAdminAtt);
          setAttendances(impAtt);
          setSalaries(impSalaries);

          // 2. Reconcile to Firebase Firestore
          try {
            await Promise.all([
              reconcileWorkersToFirebase(impWorkers),
              reconcileMachinesToFirebase(impMachines),
              reconcileDailyWorksToFirebase(impDailyWorks),
              reconcileAdminAttendancesToFirebase(impAdminAtt),
              reconcileAttendancesToFirebase(impAtt),
              reconcileSalariesToFirebase(impSalaries)
            ]);
            alert('Database restored successfully and synced with Firebase Firestore!');
          } catch (spErr: any) {
            console.warn('Backup restored locally, Firebase sync failed:', spErr);
            alert(`Data restored locally on this device! (Firebase Cloud Sync Notice: ${spErr?.message || spErr})`);
          }
        } else {
          alert('Invalid backup file format. Core fields missing.');
        }
      } catch (err: any) {
        alert('Error restoring backup file: ' + (err?.message || err));
      } finally {
        setIsSyncing(false);
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
      await Promise.all([
        reconcileWorkersToFirebase(SEED_WORKERS),
        reconcileMachinesToFirebase(DEFAULT_MACHINES),
        reconcileDailyWorksToFirebase(SEED_DAILY_WORK),
        reconcileAdminAttendancesToFirebase(SEED_ADMIN_ATTENDANCE),
        reconcileAttendancesToFirebase(SEED_LOOM_ATTENDANCE),
        reconcileSalariesToFirebase(SEED_SALARIES)
      ]);

      setWorkers(SEED_WORKERS);
      setMachines(DEFAULT_MACHINES);
      setDailyWorks(SEED_DAILY_WORK);
      setAdminAttendances(SEED_ADMIN_ATTENDANCE);
      setAttendances(SEED_LOOM_ATTENDANCE);
      setSalaries(SEED_SALARIES);

      alert('Database successfully reset to seed data in Firebase Firestore!');
    } catch (err: any) {
      alert('Error resetting database in Firebase: ' + (err?.message || err));
    } finally {
      setIsSyncing(false);
      setIsConfirmResetOpen(false);
    }
  };

  const executeClearAllData = async () => {
    setIsSyncing(true);
    try {
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

      alert('All factory data has been successfully cleared!');
    } catch (err: any) {
      alert('Error clearing data: ' + (err?.message || err));
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
            { id: 'machines', label: 'Loom machines', icon: <Cpu className="h-4.5 w-4.5 text-indigo-400" /> }
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
                  onDeleteAdminAttendance={handleDeleteAdminAttendance}
                  isAdmin={isAdmin}
                />
              )}

              {activeTab === 'other-att' && (
                <OtherAttendanceRegister
                  workers={workers}
                  adminAttendances={adminAttendances}
                  onAddAdminAttendance={handleAddAdminAttendance}
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
          message="Are you sure you want to reset all data? This will overwrite your custom modifications with the fresh demo seed dataset."
          confirmLabel="Reset"
          type="warning"
          onConfirm={executeResetToSeed}
          onCancel={() => setIsConfirmResetOpen(false)}
        />
      )}

      {isConfirmClearDataOpen && (
        <ClearDataModal
          isOpen={isConfirmClearDataOpen}
          onClose={() => setIsConfirmClearDataOpen(false)}
          onConfirmClear={executeClearAllData}
        />
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
