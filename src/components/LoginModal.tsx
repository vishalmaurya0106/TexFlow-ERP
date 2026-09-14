/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { UserSession, UserRole } from '../types';
import { 
  Factory, ShieldCheck, User, Lock, Eye, EyeOff, 
  KeyRound, CheckCircle2, AlertCircle, Sparkles, ArrowRight, X,
  Cpu, Users, Shield
} from 'lucide-react';

interface LoginModalProps {
  isOpen: boolean;
  onClose?: () => void;
  onLoginSuccess: (session: UserSession) => void;
  currentSession?: UserSession | null;
}

type ModalTab = 'admin' | 'supervisor' | 'staff';

export default function LoginModal({
  isOpen,
  onClose,
  onLoginSuccess,
  currentSession
}: LoginModalProps) {
  const [activeTab, setActiveTab] = useState<ModalTab>('admin');

  // Admin Credentials
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Supervisor Credentials
  const [supervisorUsername, setSupervisorUsername] = useState('');
  const [supervisorPassword, setSupervisorPassword] = useState('');
  const [showSupervisorPassword, setShowSupervisorPassword] = useState(false);

  // Staff Credentials
  const [staffUsername, setStaffUsername] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const [showStaffPassword, setShowStaffPassword] = useState(false);

  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleAdminSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const cleanUser = username.trim().toUpperCase();
    const cleanPass = password.trim().toUpperCase();

    if (!cleanUser || !cleanPass) {
      setErrorMsg('Please enter Admin ID and Password.');
      return;
    }

    // Direct routing if supervisor credentials were entered here
    if (cleanUser === 'SUPERVISOR1' && cleanPass === 'SUPERVISOR1') {
      onLoginSuccess({
        role: 'supervisor1',
        username: 'SUPERVISOR1',
        displayName: 'Supervisor 1',
        loggedInAt: new Date().toISOString()
      });
      return;
    }
    if (cleanUser === 'SUPERVISOR2' && cleanPass === 'SUPERVISOR2') {
      onLoginSuccess({
        role: 'supervisor2',
        username: 'SUPERVISOR2',
        displayName: 'Supervisor 2',
        loggedInAt: new Date().toISOString()
      });
      return;
    }

    // Admin authentication check (ID: ADMIN, Password: ADMIN)
    if (cleanUser === 'ADMIN' && cleanPass === 'ADMIN') {
      const session: UserSession = {
        role: 'admin',
        username: 'ADMIN',
        displayName: 'Factory Admin',
        loggedInAt: new Date().toISOString()
      };
      onLoginSuccess(session);
    } else {
      setErrorMsg('Invalid Admin Credentials! Use ID: ADMIN and Password: ADMIN.');
    }
  };

  const handleSupervisorSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const cleanUser = supervisorUsername.trim().toUpperCase();
    const cleanPass = supervisorPassword.trim().toUpperCase();

    if (!cleanUser || !cleanPass) {
      setErrorMsg('Please enter Supervisor ID and Password.');
      return;
    }

    // SUPERVISOR 1 (Loom Production Only)
    if (cleanUser === 'SUPERVISOR1' && cleanPass === 'SUPERVISOR1') {
      const session: UserSession = {
        role: 'supervisor1',
        username: 'SUPERVISOR1',
        displayName: 'Supervisor 1',
        loggedInAt: new Date().toISOString()
      };
      onLoginSuccess(session);
      return;
    }

    // SUPERVISOR 2 (Other Attendance Only)
    if (cleanUser === 'SUPERVISOR2' && cleanPass === 'SUPERVISOR2') {
      const session: UserSession = {
        role: 'supervisor2',
        username: 'SUPERVISOR2',
        displayName: 'Supervisor 2',
        loggedInAt: new Date().toISOString()
      };
      onLoginSuccess(session);
      return;
    }

    setErrorMsg('Invalid Credentials! Valid IDs are SUPERVISOR1 or SUPERVISOR2 with their corresponding password.');
  };

  const handleStaffSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const cleanStaffUser = staffUsername.trim().toUpperCase();
    const cleanStaffPass = staffPassword.trim().toUpperCase();

    if (!cleanStaffUser || !cleanStaffPass) {
      setErrorMsg('Please enter User ID and Password.');
      return;
    }

    if (cleanStaffUser === 'SUPERVISOR1' && cleanStaffPass === 'SUPERVISOR1') {
      onLoginSuccess({
        role: 'supervisor1',
        username: 'SUPERVISOR1',
        displayName: 'Supervisor 1',
        loggedInAt: new Date().toISOString()
      });
      return;
    }
    if (cleanStaffUser === 'SUPERVISOR2' && cleanStaffPass === 'SUPERVISOR2') {
      onLoginSuccess({
        role: 'supervisor2',
        username: 'SUPERVISOR2',
        displayName: 'Supervisor 2',
        loggedInAt: new Date().toISOString()
      });
      return;
    }

    if (cleanStaffUser === 'STAFF' && cleanStaffPass === 'STAFF') {
      const session: UserSession = {
        role: 'staff',
        username: 'STAFF',
        displayName: 'Staff User',
        loggedInAt: new Date().toISOString()
      };
      onLoginSuccess(session);
    } else {
      setErrorMsg('Invalid Credentials! For Staff access, User ID is STAFF and Password is STAFF.');
    }
  };

  const prefillSupervisor = (id: 'SUPERVISOR1' | 'SUPERVISOR2') => {
    setSupervisorUsername(id);
    setSupervisorPassword(id);
    setErrorMsg('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-fade-in">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-100 overflow-hidden relative">
        
        {/* Modal Header / Banner */}
        <div className="bg-gradient-to-br from-indigo-900 via-indigo-800 to-slate-900 p-6 text-white text-center relative overflow-hidden">
          <div className="absolute -right-8 -bottom-8 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl"></div>
          <div className="absolute -left-8 -top-8 w-32 h-32 bg-purple-500/10 rounded-full blur-2xl"></div>

          {currentSession && onClose && (
            <button 
              onClick={onClose}
              className="absolute top-4 right-4 text-white/70 hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors cursor-pointer"
              title="Close"
            >
              <X className="h-5 w-5" />
            </button>
          )}

          <div className="inline-flex p-3 bg-white/10 backdrop-blur-md rounded-2xl mb-3 border border-white/10">
            <Factory className="h-8 w-8 text-indigo-300" />
          </div>
          <h2 className="text-2xl font-black tracking-tight text-white">TexFlow ERP</h2>
          <p className="text-xs text-indigo-200 mt-1 font-medium">Textile Factory Management Portal</p>

          {currentSession && (
            <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 bg-white/10 rounded-full text-xs text-indigo-100 border border-white/10">
              <span>Logged in as:</span>
              <strong className="text-white font-bold">{currentSession.displayName} ({currentSession.role.toUpperCase()})</strong>
            </div>
          )}
        </div>

        {/* Role Selector Tabs */}
        <div className="p-2 bg-slate-100 flex gap-1 border-b border-slate-200">
          <button
            type="button"
            onClick={() => {
              setActiveTab('admin');
              setErrorMsg('');
            }}
            className={`flex-1 py-2.5 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'admin'
                ? 'bg-white text-indigo-700 shadow-sm border border-slate-200/80'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
            }`}
          >
            <ShieldCheck className="h-4 w-4 text-indigo-600" />
            <span>Admin</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('supervisor');
              setErrorMsg('');
            }}
            className={`flex-1 py-2.5 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'supervisor'
                ? 'bg-white text-indigo-700 shadow-sm border border-slate-200/80'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
            }`}
          >
            <Shield className="h-4 w-4 text-emerald-600" />
            <span>Supervisors</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('staff');
              setErrorMsg('');
            }}
            className={`flex-1 py-2.5 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'staff'
                ? 'bg-white text-indigo-700 shadow-sm border border-slate-200/80'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
            }`}
          >
            <User className="h-4 w-4 text-slate-500" />
            <span>Staff</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6">
          {errorMsg && (
            <div className="mb-4 bg-rose-50 border border-rose-200 text-rose-700 p-3 rounded-2xl text-xs font-medium flex items-center gap-2.5 animate-shake">
              <AlertCircle className="h-4 w-4 text-rose-500 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {activeTab === 'admin' && (
            <form onSubmit={handleAdminSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-slate-400" />
                  Admin ID / Username
                </label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. ADMIN"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all uppercase"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5 text-slate-400" />
                  Admin Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter Admin Password"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all pr-10 uppercase"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="pt-1">
                <button
                  type="submit"
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-xl shadow-lg hover:shadow-indigo-500/25 transition-all flex items-center justify-center gap-2 text-sm cursor-pointer"
                >
                  <ShieldCheck className="h-4 w-4" />
                  <span>Log In as Factory Admin</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>

              <p className="text-[11px] text-center text-slate-400">
                Default Credentials: <span className="font-mono font-semibold text-slate-600">ADMIN / ADMIN</span>
              </p>
            </form>
          )}

          {activeTab === 'supervisor' && (
            <div className="space-y-4">
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3">
                <p className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                  Quick Supervisor Login:
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => prefillSupervisor('SUPERVISOR1')}
                    className="p-2.5 text-left rounded-xl border border-indigo-200 hover:border-indigo-400 bg-white hover:bg-indigo-50/50 transition-all cursor-pointer group"
                  >
                    <div className="flex items-center gap-1 text-xs font-bold text-indigo-700">
                      <Cpu className="h-3.5 w-3.5 text-indigo-600" />
                      <span>SUPERVISOR 1</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-0.5">Loom Production</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => prefillSupervisor('SUPERVISOR2')}
                    className="p-2.5 text-left rounded-xl border border-amber-200 hover:border-amber-400 bg-white hover:bg-amber-50/50 transition-all cursor-pointer group"
                  >
                    <div className="flex items-center gap-1 text-xs font-bold text-amber-700">
                      <Users className="h-3.5 w-3.5 text-amber-600" />
                      <span>SUPERVISOR 2</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-0.5">Other Attendance</p>
                  </button>
                </div>
              </div>

              <form onSubmit={handleSupervisorSubmit} className="space-y-3.5">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-slate-400" />
                    Supervisor User ID
                  </label>
                  <input
                    type="text"
                    required
                    value={supervisorUsername}
                    onChange={(e) => setSupervisorUsername(e.target.value)}
                    placeholder="SUPERVISOR1 or SUPERVISOR2"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all uppercase"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Lock className="h-3.5 w-3.5 text-slate-400" />
                    Supervisor Password
                  </label>
                  <div className="relative">
                    <input
                      type={showSupervisorPassword ? 'text' : 'password'}
                      required
                      value={supervisorPassword}
                      onChange={(e) => setSupervisorPassword(e.target.value)}
                      placeholder="Password matches your User ID"
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all pr-10 uppercase"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSupervisorPassword(!showSupervisorPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                    >
                      {showSupervisorPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="pt-1">
                  <button
                    type="submit"
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-4 rounded-xl shadow-lg hover:shadow-emerald-500/25 transition-all flex items-center justify-center gap-2 text-sm cursor-pointer"
                  >
                    <Shield className="h-4 w-4" />
                    <span>Log In as Supervisor</span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>

                <p className="text-[11px] text-center text-slate-400">
                  Credentials: <span className="font-mono text-slate-600">SUPERVISOR1</span> / <span className="font-mono text-slate-600">SUPERVISOR1</span> or <span className="font-mono text-slate-600">SUPERVISOR2</span> / <span className="font-mono text-slate-600">SUPERVISOR2</span>
                </p>
              </form>
            </div>
          )}

          {activeTab === 'staff' && (
            <form onSubmit={handleStaffSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-slate-400" />
                  Staff User ID
                </label>
                <input
                  type="text"
                  required
                  value={staffUsername}
                  onChange={(e) => setStaffUsername(e.target.value)}
                  placeholder="e.g. STAFF"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all uppercase"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5 text-slate-400" />
                  Staff Password
                </label>
                <div className="relative">
                  <input
                    type={showStaffPassword ? 'text' : 'password'}
                    required
                    value={staffPassword}
                    onChange={(e) => setStaffPassword(e.target.value)}
                    placeholder="Enter Staff Password"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowStaffPassword(!showStaffPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                  >
                    {showStaffPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="pt-1">
                <button
                  type="submit"
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 px-4 rounded-xl shadow-md hover:shadow-slate-900/20 transition-all flex items-center justify-center gap-2 text-sm cursor-pointer"
                >
                  <User className="h-4 w-4 text-amber-400" />
                  <span>Log In as Staff</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>

              <p className="text-[11px] text-center text-slate-400">
                Default Credentials: <span className="font-mono font-semibold text-slate-600">STAFF / STAFF</span>
              </p>
            </form>
          )}
        </div>

        {/* Footer info */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 text-center">
          <p className="text-[11px] text-slate-500 font-medium">
            TexFlow ERP • Role-Based Access Control
          </p>
        </div>

      </div>
    </div>
  );
}
