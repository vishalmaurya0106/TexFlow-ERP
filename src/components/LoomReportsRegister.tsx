/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { 
  Worker, 
  DailyWork, 
  Machine, 
  Company,
  AdminAttendance,
  Attendance
} from '../types';
import { DateInput } from './DateInput';
import LoomReportPDFModal, { LoomReportItem } from './LoomReportPDFModal';
import * as XLSX from 'xlsx';
import { 
  Calendar, 
  Download, 
  Printer, 
  Search, 
  Filter, 
  Sparkles, 
  ChevronDown, 
  Cpu, 
  Users, 
  UserCheck, 
  Building2,
  CheckCircle2,
  FileSpreadsheet
} from 'lucide-react';
import { naturalSortWorkers, formatDate } from '../utils';

interface LoomReportsRegisterProps {
  workers: Worker[];
  dailyWorks: DailyWork[];
  adminAttendances?: AdminAttendance[];
  attendances?: Attendance[];
  machines: Machine[];
  companies: Company[];
}

export default function LoomReportsRegister({
  workers,
  dailyWorks,
  adminAttendances = [],
  attendances = [],
  machines,
  companies
}: LoomReportsRegisterProps) {
  // Default date range: 1st of current month to current date or end of month
  const [startDate, setStartDate] = useState(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}-01`;
  });

  const [endDate, setEndDate] = useState(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  });

  // Filter state
  const [selectedCompanyFilter, setSelectedCompanyFilter] = useState<string>('ALL');
  const [selectedDepartmentFilter, setSelectedDepartmentFilter] = useState<'Worker' | 'ALL'>('Worker');
  const [showOnlyActiveRuns, setShowOnlyActiveRuns] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Dropdown / Modal state
  const [isPDFModalOpen, setIsPDFModalOpen] = useState<boolean>(false);
  const [isGenerateMenuOpen, setIsGenerateMenuOpen] = useState<boolean>(false);
  const [lastGeneratedAt, setLastGeneratedAt] = useState<string>(() => new Date().toLocaleTimeString());

  // Calculate Loom Report Data
  const calculatedData: LoomReportItem[] = useMemo(() => {
    if (!startDate || !endDate || startDate > endDate) return [];

    // Filter active workers
    const activeWorkers = workers.filter(w => w.isActive !== false);

    // Filter by company
    const companyFiltered = activeWorkers.filter(w => {
      if (selectedCompanyFilter === 'ALL') return true;
      const wComp = w.companyName || 'TexFlow Textiles Pvt Ltd';
      return wComp === selectedCompanyFilter;
    });

    // Filter by department (Loom Worker by default, or ALL)
    const deptFiltered = companyFiltered.filter(w => {
      if (selectedDepartmentFilter === 'ALL') return true;
      return w.employeeType === selectedDepartmentFilter;
    });

    // Sort workers naturally by workerId (1, 2, 3...)
    const sorted = naturalSortWorkers(deptFiltered);

    return sorted.map(worker => {
      let totalMachineCount = 0;
      const distinctMachineSet = new Set<string>();
      let presentDays = 0;

      if (worker.employeeType === 'Worker') {
        // Loom Operator: working on machines from dailyWorks
        const workerWorks = dailyWorks.filter(dw => 
          dw.workerId === worker.workerId &&
          dw.date >= startDate &&
          dw.date <= endDate
        );

        const distinctDatesSet = new Set<string>();

        workerWorks.forEach(dw => {
          const count = typeof dw.machineCount === 'number' && dw.machineCount > 0
            ? dw.machineCount
            : (Array.isArray(dw.selectedMachines) ? dw.selectedMachines.length : 0);

          totalMachineCount += count;

          if (Array.isArray(dw.selectedMachines)) {
            dw.selectedMachines.forEach(m => distinctMachineSet.add(m));
          }

          if (count > 0 || dw.calculatedWage > 0) {
            distinctDatesSet.add(dw.date);
          }
        });

        presentDays = distinctDatesSet.size;
      } else {
        // Admin Staff or Other Staff: not working on machines; attendance from adminAttendances & attendances
        const staffAdminAtt = (adminAttendances || []).filter(aa => 
          aa.workerId === worker.workerId &&
          aa.date >= startDate &&
          aa.date <= endDate
        );

        staffAdminAtt.forEach(aa => {
          if (aa.status === 'Present') {
            presentDays += 1;
          } else if (aa.status === 'Half-Day') {
            presentDays += 0.5;
          }
        });

        const staffAtt = (attendances || []).filter(a => 
          a.workerId === worker.workerId &&
          a.date >= startDate &&
          a.date <= endDate
        );

        staffAtt.forEach(a => {
          if (a.status === 'Present') {
            if (!staffAdminAtt.some(aa => aa.date === a.date)) {
              presentDays += 1;
            }
          } else if (a.status === 'Half-Day') {
            if (!staffAdminAtt.some(aa => aa.date === a.date)) {
              presentDays += 0.5;
            }
          }
        });
      }

      // Column Present/Machine value:
      // Loom Operator: machine count (e.g. 3)
      // Admin / Other staff: present count (e.g. 1)
      const presentMachineValue = worker.employeeType === 'Worker' 
        ? totalMachineCount 
        : presentDays;

      const deptLabel = worker.employeeType === 'Worker' 
        ? 'Loom Operator' 
        : worker.employeeType === 'Admin Employee' 
        ? 'Admin Staff' 
        : 'Other Staff';

      return {
        workerId: worker.workerId,
        name: worker.name,
        companyName: worker.companyName || 'TexFlow Textiles Pvt Ltd',
        employeeType: deptLabel,
        presentDays,
        machineCount: totalMachineCount,
        presentMachineValue,
        distinctMachines: Array.from(distinctMachineSet)
      };
    });
  }, [workers, dailyWorks, adminAttendances, attendances, startDate, endDate, selectedCompanyFilter, selectedDepartmentFilter]);

  // Filtered rows by search and active work toggle
  const filteredRows = useMemo(() => {
    return calculatedData.filter(item => {
      if (showOnlyActiveRuns && item.presentMachineValue <= 0) {
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
  }, [calculatedData, searchQuery, showOnlyActiveRuns]);

  // Summary Totals
  const totalWorkers = filteredRows.length;
  const totalPresentMachine = filteredRows.reduce((sum, item) => sum + item.presentMachineValue, 0);

  // Excel (.xlsx) Export Handler
  const handleDownloadExcel = () => {
    if (!startDate || !endDate) {
      alert('Please select both Start Date and End Date.');
      return;
    }

    const companyTitle = selectedCompanyFilter === 'ALL' 
      ? 'Merged Report - All Companies' 
      : selectedCompanyFilter;

    // Headers with merged Present/Machine column
    const headers = ['SR NO', 'CODE NO', 'NAME', 'DEPARTMENT', 'Present/Machine'];

    const rows = filteredRows.map((item, index) => [
      index + 1,
      item.workerId,
      item.name,
      item.employeeType,
      item.presentMachineValue
    ]);

    const summaryRow = ['', 'TOTAL', `${filteredRows.length} Workers`, '', totalPresentMachine];

    const sheetData = [
      ['TEXFLOW TEXTILES - LOOM PRODUCTION & MACHINE REPORT'],
      [`Company: ${companyTitle}`],
      [`Date Range: ${formatDate(startDate)} to ${formatDate(endDate)}`],
      [`Generated: ${new Date().toLocaleDateString('en-IN')}`],
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
      { wch: 28 }, // NAME
      { wch: 20 }, // DEPARTMENT
      { wch: 18 }  // Present/Machine
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Loom_Report');

    const cleanComp = selectedCompanyFilter === 'ALL' ? 'All_Companies' : selectedCompanyFilter.replace(/\s+/g, '_');
    const filename = `Loom_Report_${cleanComp}_${startDate}_to_${endDate}.xlsx`;
    XLSX.writeFile(wb, filename);
  };

  // Generate / Refresh Action
  const handleGenerate = () => {
    setLastGeneratedAt(new Date().toLocaleTimeString());
    setIsGenerateMenuOpen(false);
  };

  const activeCompanyName = selectedCompanyFilter === 'ALL' 
    ? 'Merged Report - All Companies' 
    : selectedCompanyFilter;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100">
            <Cpu className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Loom Production Reports</h1>
            <p className="text-xs text-slate-500 font-medium">
              Operator working days and machine workload count by custom date range
            </p>
          </div>
        </div>

        {/* Quick status pill */}
        <div className="flex items-center gap-2 self-start md:self-auto bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          <span>Last generated: <strong className="font-mono text-slate-800">{lastGeneratedAt}</strong></span>
        </div>
      </div>

      {/* Control & Filter Panel */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-4 items-end">
          
          {/* 1. Start Date */}
          <div className="lg:col-span-3 space-y-1">
            <label className="block text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-indigo-600" />
              From Date
            </label>
            <DateInput
              id="loom-report-start-date"
              value={startDate}
              onChange={(val) => {
                if (val) setStartDate(val);
              }}
              className="bg-white"
            />
          </div>

          {/* 2. End Date */}
          <div className="lg:col-span-3 space-y-1">
            <label className="block text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-indigo-600" />
              To Date
            </label>
            <DateInput
              id="loom-report-end-date"
              value={endDate}
              onChange={(val) => {
                if (val) setEndDate(val);
              }}
              className="bg-white"
            />
          </div>

          {/* 3. Company Filter */}
          <div className="lg:col-span-3 space-y-1">
            <label className="block text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 text-indigo-600" />
              Company Filter
            </label>
            <select
              id="loom-report-company-filter"
              value={selectedCompanyFilter}
              onChange={(e) => setSelectedCompanyFilter(e.target.value)}
              className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer shadow-xs"
            >
              <option value="ALL">🏢 All Companies (Merged)</option>
              {companies.map(c => (
                <option key={c.companyId} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* 4. Action Buttons with Dropdown Options */}
          <div className="lg:col-span-3 flex items-center gap-2 relative">
            
            {/* Split Generate Button with 2 Download Options */}
            <div className="relative flex-1 flex rounded-xl shadow-xs">
              <button
                type="button"
                id="loom-report-generate-btn"
                onClick={handleGenerate}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-l-xl text-xs transition-all cursor-pointer"
                title="Calculate and display report"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Generate</span>
              </button>
              
              {/* Dropdown Toggle for 2 Options: PDF & Excel */}
              <button
                type="button"
                id="loom-report-generate-options-btn"
                onClick={() => setIsGenerateMenuOpen(!isGenerateMenuOpen)}
                className="px-2 py-2.5 bg-indigo-700 hover:bg-indigo-800 text-white rounded-r-xl border-l border-indigo-500 transition-all cursor-pointer flex items-center justify-center"
                title="Generate Options (PDF & Excel)"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>

              {/* Dropdown Menu Popup */}
              {isGenerateMenuOpen && (
                <div 
                  className="absolute right-0 top-full mt-1.5 w-52 bg-white rounded-xl shadow-xl border border-slate-200 z-30 py-1.5 animate-scale-in"
                  onMouseLeave={() => setIsGenerateMenuOpen(false)}
                >
                  <div className="px-3 py-1.5 border-b border-slate-100">
                    <p className="text-[10px] font-extrabold uppercase text-slate-400">Generate & Download</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsGenerateMenuOpen(false);
                      setIsPDFModalOpen(true);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-rose-50 hover:text-rose-700 transition-colors text-left cursor-pointer"
                  >
                    <Printer className="h-3.5 w-3.5 text-rose-600" />
                    <span>Download PDF Report</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsGenerateMenuOpen(false);
                      handleDownloadExcel();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 transition-colors text-left cursor-pointer"
                  >
                    <Download className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Download Excel Data (.xlsx)</span>
                  </button>
                </div>
              )}
            </div>

            {/* Direct Quick PDF Button */}
            <button
              type="button"
              id="loom-report-pdf-quick-btn"
              onClick={() => setIsPDFModalOpen(true)}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-extrabold rounded-xl text-xs transition-all shadow-sm cursor-pointer"
              title="Export as Printable PDF"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>PDF</span>
            </button>

            {/* Direct Quick Excel Button */}
            <button
              type="button"
              id="loom-report-xl-quick-btn"
              onClick={handleDownloadExcel}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl text-xs transition-all shadow-sm cursor-pointer"
              title="Download Excel / XLSX file"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Excel</span>
            </button>

          </div>

        </div>

        {/* Secondary Filters: Department toggle */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
            <Filter className="h-3.5 w-3.5 text-indigo-500" />
            <span>Staff Filter:</span>
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setSelectedDepartmentFilter('Worker')}
                className={`px-3 py-1 rounded-md font-bold transition-all cursor-pointer ${
                  selectedDepartmentFilter === 'Worker' 
                    ? 'bg-white text-indigo-700 shadow-xs' 
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Loom Operators Only
              </button>
              <button
                type="button"
                onClick={() => setSelectedDepartmentFilter('ALL')}
                className={`px-3 py-1 rounded-md font-bold transition-all cursor-pointer ${
                  selectedDepartmentFilter === 'ALL' 
                    ? 'bg-white text-indigo-700 shadow-xs' 
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                All Staff
              </button>
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer select-none bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100/70 transition-colors">
            <input
              type="checkbox"
              checked={showOnlyActiveRuns}
              onChange={(e) => setShowOnlyActiveRuns(e.target.checked)}
              className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
            />
            <span>Show only workers with active machine runs ({'>'} 0)</span>
          </label>
        </div>
      </div>

      {/* Summary Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Total Workers */}
        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs flex items-center gap-3">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Total Staff</p>
            <p className="text-lg font-black text-slate-900 mt-0.5">{totalWorkers} Workers</p>
          </div>
        </div>

        {/* Total Present / Machine Count */}
        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs flex items-center gap-3">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100">
            <Cpu className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] font-extrabold text-indigo-700 uppercase tracking-wider">Total Present / Machine Count</p>
            <p className="text-lg font-black text-indigo-700 mt-0.5">{totalPresentMachine}</p>
          </div>
        </div>
      </div>

      {/* Table Section */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden space-y-4 p-6">
        
        {/* Search Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              id="loom-report-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Code No. or Name..."
              className="w-full pl-10 pr-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            />
          </div>

          <div className="text-xs text-slate-500 font-semibold self-end sm:self-auto">
            Showing <strong className="text-slate-800">{filteredRows.length}</strong> of <strong className="text-slate-800">{calculatedData.length}</strong> operators
          </div>
        </div>

        {/* Table Container */}
        <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
          <div className="max-h-[500px] overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 text-slate-700 font-extrabold sticky top-0 uppercase text-[11px] border-b border-slate-200 z-10">
                <tr>
                  <th className="px-4 py-3 text-center w-14">SR.</th>
                  <th className="px-4 py-3 w-28">CODE NO.</th>
                  <th className="px-4 py-3">EMPLOYEE NAME</th>
                  <th className="px-4 py-3">DEPARTMENT</th>
                  <th className="px-4 py-3 text-center bg-indigo-100/60 text-indigo-900 w-36">
                    Present/Machine
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-slate-400 font-medium">
                      <div className="max-w-xs mx-auto space-y-2">
                        <Cpu className="h-8 w-8 text-slate-300 mx-auto" />
                        <p className="text-sm font-bold text-slate-600">No records found</p>
                        <p className="text-xs text-slate-400">
                          Try adjusting the date range or clearing filters to see records.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((item, index) => (
                    <tr 
                      key={item.workerId} 
                      className={`hover:bg-indigo-50/30 transition-colors ${
                        index % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'
                      }`}
                    >
                      {/* 1. SR NO */}
                      <td className="px-4 py-3 text-center font-bold text-slate-400">
                        {index + 1}
                      </td>

                      {/* 2. CODE NO */}
                      <td className="px-4 py-3 font-mono font-bold text-slate-900">
                        <span className="px-2 py-0.5 bg-slate-100 rounded-md border border-slate-200">
                          {item.workerId}
                        </span>
                      </td>

                      {/* 3. NAME */}
                      <td className="px-4 py-3">
                        <p className="font-bold text-slate-900">{item.name}</p>
                        <p className="text-[10px] text-slate-400 font-medium">{item.companyName}</p>
                      </td>

                      {/* 4. DEPARTMENT */}
                      <td className="px-4 py-3">
                        <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-100 text-slate-700 border border-slate-200">
                          {item.employeeType}
                        </span>
                      </td>

                      {/* 5. Present/Machine */}
                      <td className="px-4 py-3 text-center bg-indigo-50/30">
                        <span className={`font-mono font-black text-xs px-2.5 py-0.5 rounded-md border ${
                          item.presentMachineValue > 0 
                            ? 'text-indigo-700 bg-indigo-50 border-indigo-200' 
                            : 'text-slate-400 bg-slate-50 border-slate-200'
                        }`}>
                          {item.presentMachineValue}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {filteredRows.length > 0 && (
                <tfoot className="bg-slate-100 font-extrabold text-slate-900 border-t-2 border-slate-200 sticky bottom-0 z-10">
                  <tr>
                    <td className="px-4 py-3 text-center font-bold text-slate-400">#</td>
                    <td className="px-4 py-3 uppercase text-[10px] text-slate-500">TOTAL</td>
                    <td className="px-4 py-3 text-slate-900">{filteredRows.length} Workers</td>
                    <td className="px-4 py-3"></td>
                    <td className="px-4 py-3 text-center text-indigo-700 font-black font-mono">
                      {totalPresentMachine}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

      </div>

      {/* PDF Modal */}
      <LoomReportPDFModal
        isOpen={isPDFModalOpen}
        onClose={() => setIsPDFModalOpen(false)}
        startDate={startDate}
        endDate={endDate}
        companyName={activeCompanyName}
        data={filteredRows}
      />
    </div>
  );
}
