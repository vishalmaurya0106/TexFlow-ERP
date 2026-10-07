/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Printer, X, FileSpreadsheet, Calendar, Building2, UserCheck, Cpu } from 'lucide-react';
import { formatDate } from '../utils';

export interface LoomReportItem {
  workerId: string;
  name: string;
  companyName: string;
  employeeType: string;
  presentDays: number;
  machineCount: number;
  presentMachineValue: number;
  dailyValues?: Record<string, number>;
  distinctMachines?: string[];
}

interface LoomReportPDFModalProps {
  isOpen: boolean;
  onClose: () => void;
  startDate: string;
  endDate: string;
  companyName: string;
  dateList?: string[];
  data: LoomReportItem[];
}

function formatShortDate(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}`;
  }
  return dateStr;
}

export default function LoomReportPDFModal({
  isOpen,
  onClose,
  startDate,
  endDate,
  companyName,
  dateList = [],
  data
}: LoomReportPDFModalProps) {
  if (!isOpen) return null;

  const totalWorkers = data.length;
  const totalPresentMachine = data.reduce((sum, item) => sum + item.presentMachineValue, 0);

  const handlePrint = () => {
    const printElement = document.getElementById('print-loom-report-area');
    if (!printElement) {
      window.print();
      return;
    }

    // Clean up any previously leftover container
    const oldContainer = document.getElementById('texflow-print-loom-portal');
    if (oldContainer) oldContainer.remove();
    const oldStyle = document.getElementById('print-loom-report-style');
    if (oldStyle) oldStyle.remove();

    // Create a dedicated print container attached directly to document.body (outside #root)
    const printContainer = document.createElement('div');
    printContainer.id = 'texflow-print-loom-portal';
    printContainer.innerHTML = printElement.innerHTML;
    document.body.appendChild(printContainer);

    const printPadding = dateList.length > 20 ? '2px 2px' : dateList.length > 10 ? '3px 3px' : '4px 6px';
    const printFontSize = dateList.length > 20 ? '7.5px' : dateList.length > 10 ? '8.5px' : '10px';

    const style = document.createElement('style');
    style.id = 'print-loom-report-style';
    style.innerHTML = `
      @media screen {
        #texflow-print-loom-portal {
          display: none !important;
        }
      }
      @media print {
        @page {
          size: A4 landscape;
          margin: 6mm;
        }
        html, body {
          background-color: #ffffff !important;
          color: #000000 !important;
          margin: 0 !important;
          padding: 0 !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        /* Hide all body direct children except the dedicated print portal */
        body > *:not(#texflow-print-loom-portal) {
          display: none !important;
        }
        #texflow-print-loom-portal {
          display: block !important;
          position: static !important;
          width: 100% !important;
          margin: 0 !important;
          padding: 0 !important;
          background: #ffffff !important;
          color: #000000 !important;
          box-sizing: border-box !important;
        }
        #texflow-print-loom-portal table {
          width: 100% !important;
          border-collapse: collapse !important;
          page-break-inside: auto !important;
        }
        #texflow-print-loom-portal thead {
          display: table-header-group !important;
        }
        #texflow-print-loom-portal tfoot {
          display: table-footer-group !important;
        }
        #texflow-print-loom-portal tr {
          page-break-inside: avoid !important;
        }
        #texflow-print-loom-portal th, 
        #texflow-print-loom-portal td {
          border: 1px solid #94a3b8 !important;
          padding: ${printPadding} !important;
          font-size: ${printFontSize} !important;
          color: #0f172a !important;
        }
        #texflow-print-loom-portal th {
          background-color: #f1f5f9 !important;
          font-weight: bold !important;
          text-transform: uppercase !important;
        }
      }
    `;
    document.head.appendChild(style);

    window.print();

    const cleanup = () => {
      const el = document.getElementById('texflow-print-loom-portal');
      if (el) el.remove();
      const st = document.getElementById('print-loom-report-style');
      if (st) st.remove();
    };

    window.addEventListener('afterprint', cleanup, { once: true });
    setTimeout(cleanup, 1500);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex justify-center items-start overflow-y-auto p-4 md:p-8 z-50 no-print animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-6xl overflow-hidden mt-4">
        
        {/* Top Header Bar */}
        <div className="bg-slate-900 px-6 py-4 flex justify-between items-center text-white">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/20 rounded-xl">
              <FileSpreadsheet className="text-emerald-400 h-5 w-5" />
            </div>
            <div>
              <h2 className="font-bold text-base">Loom Machine & Attendance Report Preview (PDF)</h2>
              <p className="text-xs text-slate-400">
                Period: {formatDate(startDate)} to {formatDate(endDate)} • {totalWorkers} Workers
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all shadow-md cursor-pointer"
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
        <div id="print-loom-report-area" className="p-8 bg-white text-slate-900">
          
          {/* Document Header */}
          <div className="border-b-2 border-slate-900 pb-5 mb-6">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-2xl font-black tracking-tight text-slate-900 uppercase">TexFlow Textiles</h1>
                <p className="text-xs font-bold text-indigo-600 mt-0.5">LOOM FACTORY PRODUCTION & MACHINE ATTENDANCE REGISTER</p>
                <div className="flex items-center gap-2 mt-2 text-xs font-semibold text-slate-600">
                  <Building2 className="h-4 w-4 text-slate-400" />
                  <span>{companyName}</span>
                </div>
              </div>
              <div className="text-right">
                <span className="inline-block px-3 py-1 bg-indigo-50 text-indigo-700 text-xs font-black uppercase rounded-lg border border-indigo-200">
                  LOOM PRODUCTION REPORT
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
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-center">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Staff</p>
              <p className="text-lg font-black text-slate-900 mt-0.5">{totalWorkers} Workers</p>
            </div>

            <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-center">
              <p className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider flex items-center justify-center gap-1">
                <Cpu className="h-3 w-3" /> Total Present / Machine Work
              </p>
              <p className="text-lg font-black text-indigo-700 mt-0.5">{totalPresentMachine}</p>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-slate-200 text-left text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-800 font-extrabold uppercase text-[10px]">
                  <th className="border border-slate-300 px-2 py-1.5 text-center w-8">SR.</th>
                  <th className="border border-slate-300 px-2 py-1.5 w-16">CODE NO.</th>
                  <th className="border border-slate-300 px-2 py-1.5 min-w-[120px]">EMPLOYEE NAME</th>
                  <th className="border border-slate-300 px-2 py-1.5 w-24">DEPARTMENT</th>
                  <th className="border border-slate-300 px-2 py-1.5 text-center bg-indigo-50 text-indigo-900 w-28 font-black">
                    Present/Machine
                  </th>
                  {dateList.map(d => (
                    <th key={d} className="border border-slate-300 px-1 py-1 text-center bg-slate-50 text-slate-700 font-bold min-w-[36px] text-[9px]">
                      {formatShortDate(d)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.length === 0 ? (
                  <tr>
                    <td colSpan={5 + dateList.length} className="border border-slate-300 px-4 py-8 text-center text-slate-400 font-medium">
                      No records found for the selected date range.
                    </td>
                  </tr>
                ) : (
                  data.map((item, idx) => (
                    <tr key={item.workerId} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                      <td className="border border-slate-200 px-2 py-1 text-center font-medium text-slate-500">
                        {idx + 1}
                      </td>
                      <td className="border border-slate-200 px-2 py-1 font-mono font-bold text-slate-900">
                        {item.workerId}
                      </td>
                      <td className="border border-slate-200 px-2 py-1 font-bold text-slate-800 whitespace-nowrap">
                        {item.name}
                      </td>
                      <td className="border border-slate-200 px-2 py-1 text-slate-600 font-medium whitespace-nowrap">
                        {item.employeeType}
                      </td>
                      <td className="border border-slate-200 px-2 py-1 text-center font-bold text-indigo-700 bg-indigo-50/30">
                        {item.presentMachineValue}
                      </td>
                      {dateList.map(d => {
                        const val = item.dailyValues?.[d] || 0;
                        return (
                          <td key={d} className="border border-slate-200 px-1 py-1 text-center font-mono text-[10px]">
                            {val > 0 ? val : '-'}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
              {data.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-100 font-extrabold text-slate-900">
                    <td colSpan={4} className="border border-slate-300 px-2 py-1.5 text-right uppercase text-[10px]">
                      Total:
                    </td>
                    <td className="border border-slate-300 px-2 py-1.5 text-center text-indigo-700 font-mono font-bold">
                      {totalPresentMachine}
                    </td>
                    {dateList.map(d => {
                      const dayTotal = data.reduce((sum, item) => sum + (item.dailyValues?.[d] || 0), 0);
                      return (
                        <td key={d} className="border border-slate-300 px-1 py-1 text-center font-mono font-bold text-[10px] text-slate-800">
                          {dayTotal > 0 ? dayTotal : '-'}
                        </td>
                      );
                    })}
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
