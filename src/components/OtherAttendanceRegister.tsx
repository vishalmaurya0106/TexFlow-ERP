/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { Worker, AdminAttendance, AttendanceStatus } from '../types';
import { formatCurrency, formatDate, naturalSortWorkers } from '../utils';
import ConfirmModal from './ConfirmModal';
import { DateInput } from './DateInput';
import { buildDeterministicAdminAttId } from '../lib/firebase';
import { 
  Users, ClipboardCheck, 
  Trash2, Info, Check, Save, Filter, X, AlertTriangle 
} from 'lucide-react';

interface OtherAttendanceRegisterProps {
  workers: Worker[];
  adminAttendances: AdminAttendance[];
  onAddAdminAttendance: (attendance: AdminAttendance) => Promise<void> | void;
  onBatchAdminAttendance?: (records: AdminAttendance[]) => Promise<void> | void;
  onDeleteAdminAttendance: (id: string) => Promise<void> | void;
  isAdmin?: boolean;
  isSupervisor2?: boolean;
}

export default function OtherAttendanceRegister({
  workers,
  adminAttendances,
  onAddAdminAttendance,
  onBatchAdminAttendance,
  onDeleteAdminAttendance,
  isAdmin = false,
  isSupervisor2 = false
}: OtherAttendanceRegisterProps) {
  
  // Filter active Others Staff
  const otherStaff = workers.filter(w => w.isActive && w.employeeType === 'Others');

  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedShift, setSelectedShift] = useState<'Day' | 'Night'>('Day');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [saveAllSuccess, setSaveAllSuccess] = useState(false);
  const [errorBanner, setErrorBanner] = useState('');

  // Staged selection before clicking save
  const [stagedStatuses, setStagedStatuses] = useState<Record<string, AttendanceStatus>>({});

  // Confirmation Modal State
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [deleteAttendanceId, setDeleteAttendanceId] = useState('');
  const [deleteAttendanceMessage, setDeleteAttendanceMessage] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  // Get saved attendance status for a worker on the selected date & shift
  const getSavedAttendance = (workerId: string) => {
    return adminAttendances.find(a => a.workerId === workerId && a.date === selectedDate && (a.shift || 'Day') === selectedShift);
  };

  // Synchronize staged selections whenever date, shift or saved records change
  useEffect(() => {
    const newStaged: Record<string, AttendanceStatus> = {};
    otherStaff.forEach(staff => {
      const rec = adminAttendances.find(a => a.workerId === staff.workerId && a.date === selectedDate && (a.shift || 'Day') === selectedShift);
      newStaged[staff.workerId] = rec ? rec.status : 'Present';
    });
    setStagedStatuses(newStaged);
  }, [selectedDate, selectedShift, adminAttendances, workers]);

  const handleSelectStatus = (workerId: string, status: AttendanceStatus) => {
    setStagedStatuses(prev => ({
      ...prev,
      [workerId]: status
    }));
  };

  const handleSaveSingleStaff = async (staff: Worker) => {
    if (savingId === staff.workerId || isSavingAll) return;
    const status = stagedStatuses[staff.workerId] || 'Present';
    setSavingId(staff.workerId);
    setErrorBanner('');

    let calculatedWage = 0;
    if (status === 'Present') {
      calculatedWage = staff.perMachineRate;
    } else if (status === 'Half-Day') {
      calculatedWage = staff.perMachineRate / 2;
    } else if (status === 'Absent') {
      calculatedWage = 0;
    }

    const matchedId = adminAttendances.find(a => a.workerId === staff.workerId && a.date === selectedDate && (a.shift || 'Day') === selectedShift)?.adminAttendanceId;

    const payload: AdminAttendance = {
      adminAttendanceId: matchedId || buildDeterministicAdminAttId(selectedDate, selectedShift, staff.workerId),
      workerId: staff.workerId,
      date: selectedDate,
      status,
      calculatedWage: parseFloat(calculatedWage.toFixed(2)),
      shift: selectedShift
    };

    try {
      await onAddAdminAttendance(payload);
    } catch (err: any) {
      setErrorBanner(err?.message || 'Failed to save attendance record.');
    } finally {
      setSavingId(null);
    }
  };

  const handleSaveAllStaff = async () => {
    if (isSavingAll || otherStaff.length === 0) return;
    setIsSavingAll(true);
    setErrorBanner('');

    const payloads: AdminAttendance[] = otherStaff.map(staff => {
      const status = stagedStatuses[staff.workerId] || 'Present';
      let calculatedWage = 0;
      if (status === 'Present') {
        calculatedWage = staff.perMachineRate;
      } else if (status === 'Half-Day') {
        calculatedWage = staff.perMachineRate / 2;
      } else if (status === 'Absent') {
        calculatedWage = 0;
      }

      const matchedId = adminAttendances.find(a => a.workerId === staff.workerId && a.date === selectedDate && (a.shift || 'Day') === selectedShift)?.adminAttendanceId;

      return {
        adminAttendanceId: matchedId || buildDeterministicAdminAttId(selectedDate, selectedShift, staff.workerId),
        workerId: staff.workerId,
        date: selectedDate,
        status,
        calculatedWage: parseFloat(calculatedWage.toFixed(2)),
        shift: selectedShift
      };
    });

    try {
      if (onBatchAdminAttendance) {
        await onBatchAdminAttendance(payloads);
      } else {
        for (const p of payloads) {
          await onAddAdminAttendance(p);
        }
      }
      setSaveAllSuccess(true);
      setTimeout(() => setSaveAllSuccess(false), 1500);
    } catch (err: any) {
      setErrorBanner(err?.message || 'Failed to save all staff attendance.');
    } finally {
      setIsSavingAll(false);
    }
  };

  // Date Range Filter State (Default to Today)
  const todayStr = new Date().toISOString().split('T')[0];
  const [filterStartDate, setFilterStartDate] = useState<string>(todayStr);
  const [filterEndDate, setFilterEndDate] = useState<string>(todayStr);

  // Sorted staff list by Employee ID (Natural Sort)
  const sortedStaff = naturalSortWorkers(otherStaff);

  // Include ALL Others staff IDs (including inactive) so historical logs remain intact
  const otherStaffIds = new Set(workers.filter(w => w.employeeType === 'Others').map(w => w.workerId));
  const otherAttendancesList = adminAttendances.filter(a => otherStaffIds.has(a.workerId));

  // Filter by date range
  const filteredOtherAttendances = otherAttendancesList.filter(a => {
    if (filterStartDate && a.date < filterStartDate) return false;
    if (filterEndDate && a.date > filterEndDate) return false;
    return true;
  });

  const uniqueDates = Array.from(new Set(filteredOtherAttendances.map(a => a.date))).sort((a, b) => b.localeCompare(a));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      
      {/* Attendance Register Board (Left 2 columns in large screen) */}
      <div className="lg:col-span-2 space-y-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-150 shadow-sm">
          
          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-amber-50 rounded-xl text-amber-700">
                <Users className="h-6 w-6" />
              </div>
              <div>
                <h2 id="other-att-title" className="text-xl font-bold text-slate-900">Other Staff Attendance</h2>
                <p className="text-sm text-slate-500 font-medium">
                  {isSupervisor2 
                    ? 'Record daily attendance for maintenance & general staff' 
                    : 'Record daily attendance and wages for maintenance & general staff'}
                </p>
              </div>
            </div>

            {/* Date Select, Shift Toggle & Batch Save */}
            <div className="flex flex-wrap items-center gap-2.5">
              <DateInput
                id="other-att-date-input"
                value={selectedDate}
                onChange={setSelectedDate}
                className="w-40 shadow-2xs"
              />

              {/* Shift Toggle */}
              <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200">
                <button
                  type="button"
                  id="other-shift-day-btn"
                  onClick={() => setSelectedShift('Day')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                    selectedShift === 'Day'
                      ? 'bg-white text-indigo-600 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  ☀️ Day
                </button>
                <button
                  type="button"
                  id="other-shift-night-btn"
                  onClick={() => setSelectedShift('Night')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                    selectedShift === 'Night'
                      ? 'bg-slate-900 text-indigo-300 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  🌙 Night
                </button>
              </div>

              {sortedStaff.length > 0 && (
                <button
                  id="other-att-save-all-btn"
                  disabled={isSavingAll}
                  onClick={handleSaveAllStaff}
                  className="flex items-center gap-1.5 px-3.5 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-60 active:bg-amber-800 text-white font-bold rounded-xl text-xs transition-all cursor-pointer shadow-sm"
                >
                  <Save className="h-4 w-4" />
                  {isSavingAll ? 'Saving All...' : saveAllSuccess ? 'Saved All!' : `Save All Staff (${selectedShift})`}
                </button>
              )}
            </div>
          </div>

          {errorBanner && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-bold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
              <span>{errorBanner}</span>
            </div>
          )}

          {/* Active Other Staff List */}
          {sortedStaff.length === 0 ? (
            <div className="p-10 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50 my-4">
              <Users className="h-10 w-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-700 font-bold text-sm">No Active 'Others' Staff Registered</p>
              <p className="text-slate-400 text-xs mt-1">Add staff under 'Others' employee designation in Employees Directory.</p>
            </div>
          ) : (
            <div className="space-y-3.5">
              {sortedStaff.map((staff) => {
                const savedRecord = getSavedAttendance(staff.workerId);
                const currentStatus = stagedStatuses[staff.workerId] || 'Present';
                const isSaving = savingId === staff.workerId;

                // Calculate preview wage based on staged status
                let stagedWage = staff.perMachineRate;
                if (currentStatus === 'Half-Day') stagedWage = staff.perMachineRate / 2;
                if (currentStatus === 'Absent') stagedWage = 0;

                return (
                  <div 
                    key={staff.workerId}
                    className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-white hover:border-slate-300 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                  >
                    {/* Worker Info */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-slate-700 bg-slate-200/80 px-2 py-0.5 rounded-md">
                          {staff.workerId}
                        </span>
                        <h4 className="font-bold text-slate-900 text-base">{staff.name}</h4>
                        {savedRecord && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                            <Check className="h-3 w-3" /> Saved
                          </span>
                        )}
                      </div>
                      {!isSupervisor2 ? (
                        <div className="text-xs text-slate-500 font-medium flex items-center gap-3">
                          <span>Std Daily Salary: <strong className="font-mono text-slate-800">{formatCurrency(staff.perMachineRate)}</strong></span>
                          <span>•</span>
                          <span>Today Wage: <strong className="font-mono text-amber-700 font-bold">{formatCurrency(stagedWage)}</strong></span>
                        </div>
                      ) : (
                        <div className="text-xs text-slate-400 font-medium flex items-center gap-2">
                          <span>{staff.companyName || 'TexFlow Textiles'}</span>
                          <span>•</span>
                          <span>{staff.employeeType}</span>
                        </div>
                      )}
                    </div>

                    {/* Attendance Status Controls */}
                    <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
                      <div className="flex items-center gap-1 bg-white p-1 border border-slate-200 rounded-xl shadow-2xs">
                        <button
                          type="button"
                          onClick={() => handleSelectStatus(staff.workerId, 'Present')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            currentStatus === 'Present'
                              ? 'bg-emerald-600 text-white shadow-2xs'
                              : 'text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          Present
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSelectStatus(staff.workerId, 'Half-Day')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            currentStatus === 'Half-Day'
                              ? 'bg-amber-500 text-white shadow-2xs'
                              : 'text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          Half-Day
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSelectStatus(staff.workerId, 'Absent')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            currentStatus === 'Absent'
                              ? 'bg-rose-600 text-white shadow-2xs'
                              : 'text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          Absent
                        </button>
                      </div>

                      {/* Individual Save Button */}
                      <button
                        type="button"
                        onClick={() => handleSaveSingleStaff(staff)}
                        disabled={isSaving || isSavingAll}
                        className="px-3 py-2 bg-slate-900 hover:bg-slate-800 active:bg-black text-white font-bold rounded-xl text-xs transition-all cursor-pointer shrink-0 disabled:opacity-50"
                      >
                        {isSaving ? '...' : 'Save'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Attendance History Logs (Right 1 Column) */}
      <div className="space-y-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-150 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b pb-3 border-slate-100">
            <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-amber-600" /> Recent Attendance Logs
            </h3>
            <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-100">
              {filteredOtherAttendances.length} Logs
            </span>
          </div>

          {/* Date Range Filter Controls */}
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
              <Filter className="h-3.5 w-3.5 text-amber-600" />
              <span>Filter by Date Range:</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-bold text-slate-500 block mb-0.5">FROM DATE</label>
                <DateInput
                  id="other-filter-start-date"
                  value={filterStartDate}
                  onChange={setFilterStartDate}
                  className="bg-white"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 block mb-0.5">TO DATE</label>
                <DateInput
                  id="other-filter-end-date"
                  value={filterEndDate}
                  onChange={setFilterEndDate}
                  className="bg-white"
                />
              </div>
            </div>

            {/* Quick Preset Buttons */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <button
                type="button"
                id="other-btn-filter-entry"
                onClick={() => {
                  setFilterStartDate(selectedDate);
                  setFilterEndDate(selectedDate);
                }}
                className={`text-[10px] font-bold px-2 py-1 rounded-md border transition-all cursor-pointer ${
                  filterStartDate === selectedDate && filterEndDate === selectedDate
                    ? 'bg-amber-600 text-white border-amber-700'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                Entry Date ({formatDate(selectedDate)})
              </button>

              <button
                type="button"
                id="other-btn-filter-today"
                onClick={() => {
                  const today = new Date().toISOString().split('T')[0];
                  setFilterStartDate(today);
                  setFilterEndDate(today);
                }}
                className={`text-[10px] font-bold px-2 py-1 rounded-md border transition-all cursor-pointer ${
                  filterStartDate === new Date().toISOString().split('T')[0] && filterEndDate === new Date().toISOString().split('T')[0]
                    ? 'bg-amber-600 text-white border-amber-700'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                Today
              </button>

              {(filterStartDate || filterEndDate) && (
                <button
                  type="button"
                  id="other-btn-filter-clear"
                  onClick={() => {
                    setFilterStartDate('');
                    setFilterEndDate('');
                  }}
                  className="text-[10px] font-bold px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-md transition-all flex items-center gap-1 cursor-pointer"
                >
                  <X className="h-3 w-3" /> All Dates
                </button>
              )}
            </div>
          </div>

          {uniqueDates.length === 0 ? (
            <div className="p-8 text-center border-2 border-dashed border-slate-150 rounded-xl bg-slate-50/50 my-2">
              <Info className="h-8 w-8 text-slate-300 mx-auto mb-2" />
              <p className="text-slate-500 font-bold text-xs">No Attendance Logs Found</p>
              <p className="text-slate-400 text-[11px] mt-0.5">
                {(filterStartDate || filterEndDate) ? 'No logs found in selected date range.' : 'Select status and click Save to log attendance.'}
              </p>
            </div>
          ) : (
            <div className="space-y-4 max-h-[600px] overflow-y-auto pr-1">
              {uniqueDates.map(dateStr => {
                const logsForDate = filteredOtherAttendances.filter(a => a.date === dateStr);

                return (
                  <div key={dateStr} className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/40 space-y-2.5">
                    <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
                      <span className="font-mono text-xs font-bold text-amber-800 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-md">
                        {formatDate(dateStr)}
                      </span>
                      <span className="text-[11px] font-bold text-slate-500">
                        {logsForDate.length} Staff Logged
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      {logsForDate.map(log => {
                        const staffMember = workers.find(w => w.workerId === log.workerId);
                        const staffName = staffMember ? staffMember.name : log.workerId;

                        return (
                          <div 
                            key={log.adminAttendanceId} 
                            className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-150 text-xs"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[11px] text-slate-400 font-semibold">{log.workerId}</span>
                              <span className="font-bold text-slate-800">{staffName}</span>
                            </div>
                            
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold ${
                                log.status === 'Present' 
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                                  : log.status === 'Half-Day'
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                  : 'bg-rose-50 text-rose-700 border border-rose-200'
                              }`}>
                                {isSupervisor2 ? log.status : `${log.status} (${formatCurrency(log.calculatedWage)})`}
                              </span>
                              <span className={`text-[9px] font-bold rounded-full px-2 py-0.5 flex items-center gap-0.5 border ${
                                (log.shift || 'Day') === 'Night' 
                                  ? 'bg-slate-900 text-indigo-300 border-slate-700' 
                                  : 'bg-amber-50 text-amber-700 border-amber-200'
                              }`}>
                                {(log.shift || 'Day') === 'Night' ? '🌙 Night' : '☀️ Day'}
                              </span>

                              {isAdmin && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDeleteAttendanceId(log.adminAttendanceId);
                                    setDeleteAttendanceMessage(`Are you sure you want to delete attendance record for ${staffName} on ${formatDate(log.date)}?`);
                                    setIsConfirmDeleteOpen(true);
                                  }}
                                  className="text-slate-400 hover:text-rose-600 p-1 transition-colors cursor-pointer"
                                  title="Delete Record"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Confirm Delete Modal */}
      <ConfirmModal
        isOpen={isConfirmDeleteOpen}
        title="Delete Attendance Record"
        message={deleteAttendanceMessage}
        confirmLabel={isDeleting ? 'Deleting...' : 'Delete Record'}
        cancelLabel="Cancel"
        onConfirm={async () => {
          if (!isAdmin || isDeleting) {
            if (!isAdmin) setIsConfirmDeleteOpen(false);
            return;
          }
          if (deleteAttendanceId) {
            setIsDeleting(true);
            setErrorBanner('');
            try {
              await onDeleteAdminAttendance(deleteAttendanceId);
              setDeleteAttendanceId('');
              setIsConfirmDeleteOpen(false);
            } catch (err: any) {
              setErrorBanner(err?.message || 'Failed to delete attendance record.');
              setIsConfirmDeleteOpen(false);
            } finally {
              setIsDeleting(false);
            }
          } else {
            setIsConfirmDeleteOpen(false);
          }
        }}
        onCancel={() => {
          if (isDeleting) return;
          setDeleteAttendanceId('');
          setIsConfirmDeleteOpen(false);
        }}
      />
    </div>
  );
}
