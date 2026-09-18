/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Printer, X, FileSpreadsheet, Calendar, Building2, UserCheck, UserX } from 'lucide-react';
import { formatDate } from '../utils';

export interface AttendanceReportItem {
  workerId: string;
  name: string;
  companyName: string;
  employeeType: string;
  presentDays: number;
  absentDays: number;
  totalWorkingDays: number;
}

interface AttendanceReportPDFModalProps {
  isOpen: boolean;
  onClose: () => void;
  reportType: 'Present' | 'Absent' | 'Both';
  startDate: string;
  endDate: string;
  companyName: string;
  data: AttendanceReportItem[];
}

export default function AttendanceReportPDFModal({
  isOpen,
  onClose,
  reportType,
  startDate,
  endDate,
  companyName,
  data
}: AttendanceReportPDFModalProps) {
  if (!isOpen) return null;

  const totalEmployees = data.length;
  const totalPresent = data.reduce((sum, item) => sum + item.presentDays, 0);
  const totalAbsent = data.reduce((sum, item) => sum + item.absentDays, 0);

  const handlePrint = () => {
    const style = document.createElement('style');
    style.id = 'print-attendance-report-style';
    style.innerHTML = `
      @media print {
        body {
          background-color: #ffffff !important;
          color: #000000 !important;
        }
        #root, .no-print {
          display: none !important;
        }
        #print-attendance-area {
          display: block !important;
          position: absolute;
          left: 0;
          top: 0;
          width: 100%;
          margin: 0;
          padding: 16px;
        }
        table {
          width: 100% !important;
          border-collapse: collapse !important;
        }
        th, td {
          border: 1px solid #cbd5e1 !important;
          padding: 6px 10px !important;
          font-size: 11px !important;
        }
        th {
          background-color: #f1f5f9 !important;
          font-weight: bold !important;
          color: #0f172a !important;
        }
      }
    `;
    document.head.appendChild(style);

    window.print();

    setTimeout(() => {
      const existing = document.getElementById('print-attendance-report-style');
      if (existing) existing.remove();
    }, 500);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex justify-center items-start overflow-y-auto p-4 md:p-8 z-50 no-print animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden mt-4">
        
        {/* Top Header Bar */}
        <div className="bg-slate-900 px-6 py-4 flex justify-between items-center text-white">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/20 rounded-xl">
              <FileSpreadsheet className="text-indigo-400 h-5 w-5" />
            </div>
            <div>
              <h2 className="font-bold text-base">Attendance Report Preview (PDF)</h2>
              <p className="text-xs text-slate-400">
                {reportType === 'Both' ? 'Present & Absent Report' : `${reportType} Report`} • {formatDate(startDate)} to {formatDate(endDate)}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all shadow-md cursor-pointer"
            >
              <Printer className="h-4 w-4" />
              <span>Print / Save as PDF</span>
            </button>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
              title="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Printable Area */}
        <div id="print-attendance-area" className="p-8 bg-white text-slate-900">
          
          {/* Document Header */}
          <div className="border-b-2 border-slate-900 pb-5 mb-6">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-2xl font-black tracking-tight text-slate-900 uppercase">TexFlow ERP</h1>
                <p className="text-xs font-bold text-indigo-600 mt-0.5">TEXTILE FACTORY MANAGEMENT SYSTEM</p>
                <div className="flex items-center gap-2 mt-2 text-xs font-semibold text-slate-600">
                  <Building2 className="h-4 w-4 text-slate-400" />
                  <span>{companyName}</span>
                </div>
              </div>
              <div className="text-right">
                <span className="inline-block px-3 py-1 bg-indigo-50 text-indigo-700 text-xs font-black uppercase rounded-lg border border-indigo-200">
                  {reportType === 'Both' ? 'PRESENT & ABSENT REPORT' : `${reportType.toUpperCase()} REPORT`}
                </span>
                <p className="text-xs font-bold text-slate-700 mt-2 flex items-center justify-end gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-slate-400" />
                  <span>Period: {formatDate(startDate)} to {formatDate(endDate)}</span>
                </p>
                <p className="text-[10px] text-slate-400 mt-1">
                  Generated on: {new Date().toLocaleDateString('en-IN')}
                </p>
              </div>
            </div>
          </div>

          {/* Key Summary Cards */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-center">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Staff</p>
              <p className="text-lg font-black text-slate-900 mt-0.5">{totalEmployees}</p>
            </div>

            {(reportType === 'Present' || reportType === 'Both') && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-center">
                <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider flex items-center justify-center gap-1">
                  <UserCheck className="h-3 w-3" /> Total Present Days
                </p>
                <p className="text-lg font-black text-emerald-700 mt-0.5">{totalPresent}</p>
              </div>
            )}

            {(reportType === 'Absent' || reportType === 'Both') && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-center">
                <p className="text-[10px] font-bold text-rose-700 uppercase tracking-wider flex items-center justify-center gap-1">
                  <UserX className="h-3 w-3" /> Total Absent Days
                </p>
                <p className="text-lg font-black text-rose-700 mt-0.5">{totalAbsent}</p>
              </div>
            )}
          </div>

          {/* Attendance Table */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-slate-200 text-left text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-800 font-extrabold uppercase text-[11px]">
                  <th className="border border-slate-300 px-3 py-2 text-center w-12">SR.</th>
                  <th className="border border-slate-300 px-3 py-2">CODE NO.</th>
                  <th className="border border-slate-300 px-3 py-2">EMPLOYEE NAME</th>
                  <th className="border border-slate-300 px-3 py-2">DEPARTMENT</th>
                  {(reportType === 'Present' || reportType === 'Both') && (
                    <th className="border border-slate-300 px-3 py-2 text-center bg-emerald-50 text-emerald-800">
                      PRESENT
                    </th>
                  )}
                  {(reportType === 'Absent' || reportType === 'Both') && (
                    <th className="border border-slate-300 px-3 py-2 text-center bg-rose-50 text-rose-800">
                      ABSENT
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {data.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="border border-slate-300 px-4 py-8 text-center text-slate-400 font-medium">
                      No records found for the selected date range and filter criteria.
                    </td>
                  </tr>
                ) : (
                  data.map((item, idx) => (
                    <tr key={item.workerId} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                      <td className="border border-slate-200 px-3 py-2 text-center font-medium text-slate-500">
                        {idx + 1}
                      </td>
                      <td className="border border-slate-200 px-3 py-2 font-mono font-bold text-slate-900">
                        {item.workerId}
                      </td>
                      <td className="border border-slate-200 px-3 py-2 font-bold text-slate-800">
                        {item.name}
                      </td>
                      <td className="border border-slate-200 px-3 py-2 text-slate-600 font-medium">
                        {item.employeeType}
                      </td>
                      {(reportType === 'Present' || reportType === 'Both') && (
                        <td className="border border-slate-200 px-3 py-2 text-center font-bold text-emerald-700 bg-emerald-50/30">
                          {item.presentDays}
                        </td>
                      )}
                      {(reportType === 'Absent' || reportType === 'Both') && (
                        <td className="border border-slate-200 px-3 py-2 text-center font-bold text-rose-700 bg-rose-50/30">
                          {item.absentDays}
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
              {data.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-100 font-extrabold text-slate-900">
                    <td colSpan={4} className="border border-slate-300 px-3 py-2 text-right uppercase">
                      Total:
                    </td>
                    {(reportType === 'Present' || reportType === 'Both') && (
                      <td className="border border-slate-300 px-3 py-2 text-center text-emerald-700">
                        {totalPresent}
                      </td>
                    )}
                    {(reportType === 'Absent' || reportType === 'Both') && (
                      <td className="border border-slate-300 px-3 py-2 text-center text-rose-700">
                        {totalAbsent}
                      </td>
                    )}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Signatures Footer */}
          <div className="mt-12 pt-8 border-t border-slate-300 grid grid-cols-2 text-center text-xs text-slate-600 font-semibold">
            <div>
              <div className="h-10"></div>
              <p className="border-t border-slate-400 pt-2 inline-block px-8">Prepared By</p>
            </div>
            <div>
              <div className="h-10"></div>
              <p className="border-t border-slate-400 pt-2 inline-block px-8">Authorized Signatory</p>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
