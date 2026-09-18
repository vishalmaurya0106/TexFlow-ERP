/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo } from 'react';
import { Worker, DailyWork, AdminAttendance, Attendance } from '../types';
import { DateInput } from './DateInput';
import AttendanceReportPDFModal, { AttendanceReportItem } from './AttendanceReportPDFModal';
import * as XLSX from 'xlsx';
import { 
  ClipboardCheck, Calendar, Download, Printer, Search, 
  ChevronDown, ChevronUp, UserCheck, UserX, Users, Filter, Sparkles
} from 'lucide-react';
import { naturalSortWorkers } from '../utils';

interface AttendanceReportDivisionProps {
  workers: Worker[];
  dailyWorks: DailyWork[];
  adminAttendances: AdminAttendance[];
  attendances?: Attendance[];
  selectedCompanyFilter: string;
  defaultStartDate?: string;
  defaultEndDate?: string;
}

export default function AttendanceReportDivision({
  workers,
  dailyWorks,
  adminAttendances,
  attendances = [],
  selectedCompanyFilter,
  defaultStartDate = '',
  defaultEndDate = ''
}: AttendanceReportDivisionProps) {
  // Date range state
  const [startDate, setStartDate] = useState(() => {
    if (defaultStartDate) return defaultStartDate;
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}-01`;
  });

  const [endDate, setEndDate] = useState(() => {
    if (defaultEndDate) return defaultEndDate;
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    const lastDay = new Date(y, m, 0).getDate();
    return `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  });

  // Report Type Dropdown: 'Present' | 'Absent' | 'Both'
  const [reportType, setReportType] = useState<'Present' | 'Absent' | 'Both'>('Both');

  // Interactive generation state
  const [isGenerated, setIsGenerated] = useState(true);
  const [isPDFModalOpen, setIsPDFModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showOnlyAbsentees, setShowOnlyAbsentees] = useState(false);

  // Helper to build list of dates in range
  const dateList = useMemo(() => {
    if (!startDate || !endDate || startDate > endDate) return [];
    const dates: string[] = [];
    const [sy, sm, sd] = startDate.split('-').map(Number);
    const [ey, em, ed] = endDate.split('-').map(Number);
    const curr = new Date(sy, sm - 1, sd);
    const end = new Date(ey, em - 1, ed);

    while (curr <= end) {
      const y = curr.getFullYear();
      const m = String(curr.getMonth() + 1).padStart(2, '0');
      const d = String(curr.getDate()).padStart(2, '0');
      dates.push(`${y}-${m}-${d}`);
      curr.setDate(curr.getDate() + 1);
    }
    return dates;
  }, [startDate, endDate]);

  // Set of dates on which the factory was actively operating
  const activeFactoryDates = useMemo(() => {
    const set = new Set<string>();
    dailyWorks.forEach(dw => {
      if (dw.date >= startDate && dw.date <= endDate && (dw.machineCount > 0 || dw.calculatedWage > 0)) {
        set.add(dw.date);
      }
    });
    adminAttendances.forEach(aa => {
      if (aa.date >= startDate && aa.date <= endDate) {
        set.add(aa.date);
      }
    });
    attendances.forEach(att => {
      if (att.date >= startDate && att.date <= endDate) {
        set.add(att.date);
      }
    });
    return set;
  }, [dailyWorks, adminAttendances, attendances, startDate, endDate]);

  // Calculate Attendance rows for all relevant workers
  const calculatedData: AttendanceReportItem[] = useMemo(() => {
    if (dateList.length === 0) return [];

    // Filter workers by active and company filter
    const activeWorkers = workers.filter(w => w.isActive !== false);
    const companyFiltered = activeWorkers.filter(w => {
      const wComp = w.companyName || 'TexFlow Textiles Pvt Ltd';
      if (selectedCompanyFilter !== 'ALL' && wComp !== selectedCompanyFilter) {
        return false;
      }
      return true;
    });

    const sorted = naturalSortWorkers(companyFiltered);

    return sorted.map(worker => {
      // If worker joined after startDate, filter dates to on or after joiningDate
      let workerDates = dateList;
      if (worker.joiningDate && worker.joiningDate > dateList[0]) {
        workerDates = dateList.filter(d => d >= worker.joiningDate);
      }

      let presentDays = 0;
      let absentDays = 0;

      // Group worker's records for fast lookup
      const dwMap = new Map<string, DailyWork>();
      dailyWorks.forEach(dw => {
        if (dw.workerId === worker.workerId && dw.date >= startDate && dw.date <= endDate) {
          dwMap.set(dw.date, dw);
        }
      });

      const aaMap = new Map<string, AdminAttendance>();
      adminAttendances.forEach(aa => {
        if (aa.workerId === worker.workerId && aa.date >= startDate && aa.date <= endDate) {
          aaMap.set(aa.date, aa);
        }
      });

      const attMap = new Map<string, Attendance>();
      attendances.forEach(att => {
        if (att.workerId === worker.workerId && att.date >= startDate && att.date <= endDate) {
          attMap.set(att.date, att);
        }
      });

      workerDates.forEach(d => {
        const dw = dwMap.get(d);
        const aa = aaMap.get(d);
        const att = attMap.get(d);

        if (dw && (dw.machineCount > 0 || dw.calculatedWage > 0)) {
          presentDays += 1;
        } else if (aa) {
          if (aa.status === 'Present') {
            presentDays += 1;
          } else if (aa.status === 'Half-Day') {
            presentDays += 0.5;
            absentDays += 0.5;
          } else if (aa.status === 'Absent') {
            absentDays += 1;
          }
        } else if (att) {
          if (att.status === 'Present') {
            presentDays += 1;
          } else if (att.status === 'Half-Day') {
            presentDays += 0.5;
            absentDays += 0.5;
          } else if (att.status === 'Absent') {
            absentDays += 1;
          }
        } else {
          // If no record on date d, check if the factory was actively open
          if (activeFactoryDates.has(d)) {
            absentDays += 1;
          }
        }
      });

      // If worker has monthlyDays defined (e.g. 26) and range is a month:
      if (worker.monthlyDays && worker.monthlyDays > 0 && workerDates.length >= 25) {
        if (presentDays > 0 && absentDays === 0 && presentDays < worker.monthlyDays) {
          absentDays = worker.monthlyDays - presentDays;
        }
      }

      return {
        workerId: worker.workerId,
        name: worker.name,
        companyName: worker.companyName || 'TexFlow Textiles Pvt Ltd',
        employeeType: worker.employeeType || 'Worker',
        presentDays: Math.round(presentDays * 10) / 10,
        absentDays: Math.round(absentDays * 10) / 10,
        totalWorkingDays: workerDates.length
      };
    });
  }, [workers, dateList, dailyWorks, adminAttendances, attendances, activeFactoryDates, selectedCompanyFilter, startDate, endDate]);

  // Filtered rows for table search / absentees toggle
  const filteredRows = useMemo(() => {
    return calculatedData.filter(item => {
      if (showOnlyAbsentees && item.absentDays <= 0) {
        return false;
      }
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        item.workerId.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q) ||
        item.companyName.toLowerCase().includes(q) ||
        item.employeeType.toLowerCase().includes(q)
      );
    });
  }, [calculatedData, searchQuery, showOnlyAbsentees]);

  // Totals
  const totalEmployees = calculatedData.length;
  const totalPresent = calculatedData.reduce((s, r) => s + r.presentDays, 0);
  const totalAbsent = calculatedData.reduce((s, r) => s + r.absentDays, 0);

  // Generate Excel (XLSX) Export using SheetJS
  const handleDownloadExcel = () => {
    if (!startDate || !endDate) {
      alert("Please select both Start Date and End Date.");
      return;
    }

    const companyTitle = selectedCompanyFilter === 'ALL' 
      ? 'Merged Report - All Companies' 
      : selectedCompanyFilter;

    // Build worksheet headers matching user request
    let headers: string[] = [];
    if (reportType === 'Present') {
      headers = ['SR NO', 'CODE NO', 'NAME', 'DEPARTMENT', 'PRESENT DAYS'];
    } else if (reportType === 'Absent') {
      headers = ['SR NO', 'CODE NO', 'NAME', 'DEPARTMENT', 'ABSENT DAYS'];
    } else {
      headers = ['SR NO', 'CODE NO', 'NAME', 'DEPARTMENT', 'PRESENT DAYS', 'ABSENT DAYS'];
    }

    const rows = filteredRows.map((item, index) => {
      if (reportType === 'Present') {
        return [
          index + 1,
          item.workerId,
          item.name,
          item.employeeType,
          item.presentDays
        ];
      } else if (reportType === 'Absent') {
        return [
          index + 1,
          item.workerId,
          item.name,
          item.employeeType,
          item.absentDays
        ];
      } else {
        return [
          index + 1,
          item.workerId,
          item.name,
          item.employeeType,
          item.presentDays,
          item.absentDays
        ];
      }
    });

    // Summary row
    let summaryRow: any[] = [];
    if (reportType === 'Present') {
      summaryRow = ['', 'TOTAL', `${filteredRows.length} Staff`, '', totalPresent];
    } else if (reportType === 'Absent') {
      summaryRow = ['', 'TOTAL', `${filteredRows.length} Staff`, '', totalAbsent];
    } else {
      summaryRow = ['', 'TOTAL', `${filteredRows.length} Staff`, '', totalPresent, totalAbsent];
    }

    const sheetData = [
      [`TEXFLOW ERP - ATTENDANCE REPORT (${reportType.toUpperCase()})`],
      [`Company: ${companyTitle}`],
      [`Date Range: ${startDate} to ${endDate}`],
      [], // Blank row
      headers,
      ...rows,
      [],
      summaryRow
    ];

    const ws = XLSX.utils.aoa_to_sheet(sheetData);

    // Set column widths
    ws['!cols'] = [
      { wch: 8 },  // SR NO
      { wch: 14 }, // CODE NO
      { wch: 26 }, // NAME
      { wch: 18 }, // DEPARTMENT
      { wch: 16 }, // PRESENT
      { wch: 16 }  // ABSENT
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance_Report');

    const cleanComp = selectedCompanyFilter === 'ALL' ? 'All_Companies' : selectedCompanyFilter.replace(/\s+/g, '_');
    const filename = `Attendance_${reportType}_${cleanComp}_${startDate}_to_${endDate}.xlsx`;
    XLSX.writeFile(wb, filename);
  };

  const activeCompanyName = selectedCompanyFilter === 'ALL' 
    ? 'Merged Report - All Companies' 
    : selectedCompanyFilter;

  return (
    <div id="attendance-report-division" className="bg-white rounded-2xl border-2 border-indigo-200/80 shadow-md p-6 space-y-6">
      
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-indigo-600 to-indigo-800 text-white rounded-xl shadow-md">
            <ClipboardCheck className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-black text-slate-900 tracking-tight">
                Attendance Report Division
              </h3>
              <span className="px-2.5 py-0.5 bg-indigo-100 text-indigo-800 font-extrabold text-[11px] rounded-full uppercase">
                Present / Absent
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Select date range, choose report type (Present, Absent, or Both), and generate instant PDF or Excel (XLSX)
            </p>
          </div>
        </div>

        {/* Quick summary pill */}
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3.5 py-2 rounded-xl text-xs">
          <span className="text-slate-500 font-semibold">Active Company:</span>
          <span className="font-extrabold text-indigo-700 max-w-[200px] truncate" title={activeCompanyName}>
            {activeCompanyName}
          </span>
        </div>
      </div>

      {/* Control Filters Form */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-4 items-end bg-indigo-50/40 p-4 rounded-xl border border-indigo-100">
        
        {/* Start Date */}
        <div className="lg:col-span-3 space-y-1">
          <label className="block text-xs font-bold text-slate-700 flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-indigo-600" />
            Start Date
          </label>
          <DateInput
            id="attendance-report-start-date"
            value={startDate}
            onChange={(val) => {
              if (!val) {
                alert("Error: Date cannot be zero! Page is refreshing...");
                window.location.reload();
                return;
              }
              setStartDate(val);
            }}
            className="bg-white"
          />
        </div>

        {/* End Date */}
        <div className="lg:col-span-3 space-y-1">
          <label className="block text-xs font-bold text-slate-700 flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-indigo-600" />
            End Date
          </label>
          <DateInput
            id="attendance-report-end-date"
            value={endDate}
            onChange={(val) => {
              if (!val) {
                alert("Error: Date cannot be zero! Page is refreshing...");
                window.location.reload();
                return;
              }
              setEndDate(val);
            }}
            className="bg-white"
          />
        </div>

        {/* Dropdown with 3 options: Present, Absent, Both */}
        <div className="lg:col-span-3 space-y-1">
          <label className="block text-xs font-bold text-slate-700 flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-indigo-600" />
            Attendance Option
          </label>
          <select
            id="attendance-report-dropdown"
            value={reportType}
            onChange={(e) => setReportType(e.target.value as 'Present' | 'Absent' | 'Both')}
            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-extrabold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer shadow-xs"
          >
            <option value="Present">🟢 Present (Present Only)</option>
            <option value="Absent">🔴 Absent (Absent Only)</option>
            <option value="Both">🟣 Both (Present & Absent Columns)</option>
          </select>
        </div>

        {/* Action Buttons: Generate, PDF, XL */}
        <div className="lg:col-span-3 flex items-center gap-2">
          {/* Generate / Refresh Button */}
          <button
            type="button"
            id="attendance-report-generate-btn"
            onClick={() => setIsGenerated(true)}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl text-xs transition-all shadow-sm cursor-pointer"
            title="Calculate and display report"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Generate</span>
          </button>

          {/* Export PDF Button */}
          <button
            type="button"
            id="attendance-report-pdf-btn"
            onClick={() => setIsPDFModalOpen(true)}
            className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-extrabold rounded-xl text-xs transition-all shadow-sm cursor-pointer"
            title="Export as Printable PDF"
          >
            <Printer className="h-3.5 w-3.5" />
            <span>PDF</span>
          </button>

          {/* Export XL (XLSX) Button */}
          <button
            type="button"
            id="attendance-report-xl-btn"
            onClick={handleDownloadExcel}
            className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl text-xs transition-all shadow-sm cursor-pointer"
            title="Download Excel / XLSX file"
          >
            <Download className="h-3.5 w-3.5" />
            <span>XL (Excel)</span>
          </button>
        </div>

      </div>

      {/* Generated Report Table Section */}
      {isGenerated && (
        <div className="space-y-4 pt-2">
          
          {/* Summary Stats Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-3">
              <div className="p-2 bg-indigo-100 text-indigo-700 rounded-lg">
                <Users className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase">Total Employees</p>
                <p className="text-sm font-black text-slate-800">{totalEmployees} Staff</p>
              </div>
            </div>

            {(reportType === 'Present' || reportType === 'Both') && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3">
                <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg">
                  <UserCheck className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-emerald-700 uppercase">Total Present Days</p>
                  <p className="text-sm font-black text-emerald-700">{totalPresent} Days</p>
                </div>
              </div>
            )}

            {(reportType === 'Absent' || reportType === 'Both') && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-3">
                <div className="p-2 bg-rose-100 text-rose-700 rounded-lg">
                  <UserX className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-rose-700 uppercase">Total Absent Days</p>
                  <p className="text-sm font-black text-rose-700">{totalAbsent} Days</p>
                </div>
              </div>
            )}
          </div>

          {/* Search and Absentees Toggle Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by Code No. or Name..."
                className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>

            {reportType !== 'Present' && (
              <label className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer select-none bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
                <input
                  type="checkbox"
                  checked={showOnlyAbsentees}
                  onChange={(e) => setShowOnlyAbsentees(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                <span>Show only workers with absences ({'>'} 0)</span>
              </label>
            )}
          </div>

          {/* Table Container */}
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 font-extrabold sticky top-0 uppercase text-[11px] border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-2.5 text-center w-12">SR.</th>
                    <th className="px-4 py-2.5">CODE NO.</th>
                    <th className="px-4 py-2.5">EMPLOYEE NAME</th>
                    <th className="px-4 py-2.5">DEPARTMENT</th>
                    {(reportType === 'Present' || reportType === 'Both') && (
                      <th className="px-4 py-2.5 text-center bg-emerald-100/60 text-emerald-900">
                        PRESENT
                      </th>
                    )}
                    {(reportType === 'Absent' || reportType === 'Both') && (
                      <th className="px-4 py-2.5 text-center bg-rose-100/60 text-rose-900">
                        ABSENT
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-400 font-medium">
                        No employees found matching criteria for {startDate} to {endDate}.
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((item, index) => (
                      <tr key={item.workerId} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-4 py-2 text-center text-slate-400 font-medium">
                          {index + 1}
                        </td>
                        <td className="px-4 py-2 font-mono font-bold text-indigo-950">
                          {item.workerId}
                        </td>
                        <td className="px-4 py-2 font-bold text-slate-800">
                          {item.name}
                        </td>
                        <td className="px-4 py-2 text-slate-600 font-medium">
                          {item.employeeType}
                        </td>
                        {(reportType === 'Present' || reportType === 'Both') && (
                          <td className="px-4 py-2 text-center font-bold text-emerald-700 bg-emerald-50/30">
                            {item.presentDays}
                          </td>
                        )}
                        {(reportType === 'Absent' || reportType === 'Both') && (
                          <td className={`px-4 py-2 text-center font-bold bg-rose-50/30 ${
                            item.absentDays > 0 ? 'text-rose-700 font-black' : 'text-slate-400'
                          }`}>
                            {item.absentDays}
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            
            {/* Table Footer with quick action export */}
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs font-semibold text-slate-600">
              <span>Showing {filteredRows.length} of {calculatedData.length} records</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsPDFModalOpen(true)}
                  className="inline-flex items-center gap-1 text-rose-700 hover:text-rose-800 font-bold cursor-pointer hover:underline"
                >
                  <Printer className="h-3.5 w-3.5" /> View/Print PDF
                </button>
                <span className="text-slate-300">•</span>
                <button
                  type="button"
                  onClick={handleDownloadExcel}
                  className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-800 font-bold cursor-pointer hover:underline"
                >
                  <Download className="h-3.5 w-3.5" /> Download Excel (.xlsx)
                </button>
              </div>
            </div>
          </div>

        </div>
      )}

      {/* PDF Printable Modal */}
      <AttendanceReportPDFModal
        isOpen={isPDFModalOpen}
        onClose={() => setIsPDFModalOpen(false)}
        reportType={reportType}
        startDate={startDate}
        endDate={endDate}
        companyName={activeCompanyName}
        data={filteredRows}
      />

    </div>
  );
}
