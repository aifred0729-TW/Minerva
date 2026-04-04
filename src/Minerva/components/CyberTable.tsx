import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ChevronRight, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

interface Column<T> {
  header: string;
  accessorKey?: string;
  cell?: (item: T) => React.ReactNode;
  className?: string;
  sortKey?: string;
  filterKey?: string;
}

export type SortDir = 'ASC' | 'DESC';

interface CyberTableProps<T> {
  data: T[];
  columns: Column<T>[];
  onRowClick?: (item: T) => void;
  onRowDoubleClick?: (item: T) => void;
  onRowContextMenu?: (item: T, e: React.MouseEvent) => void;
  onHeaderRightClick?: (col: Column<T>, e: React.MouseEvent) => void;
  isLoading?: boolean;
  emptyContent?: React.ReactNode;
  getRowColor?: (item: T) => string | undefined;
  sortKey?: string | null;
  sortDir?: SortDir;
  onSort?: (key: string) => void;
  rowFontSize?: number;
  renderRowPrefix?: (item: T) => React.ReactNode;
}

export function CyberTable<T extends { id: number | string }>({ data, columns, onRowClick, onRowDoubleClick, onRowContextMenu, onHeaderRightClick, isLoading, emptyContent, getRowColor, sortKey, sortDir, onSort, rowFontSize = 12, renderRowPrefix }: CyberTableProps<T>) {
  const cellPy = rowFontSize <= 10 ? 'py-1' : rowFontSize >= 16 ? 'py-4' : rowFontSize >= 14 ? 'py-3' : 'py-2';
  return (
    <div className="w-full border border-ghost/30 bg-void relative overflow-hidden">
      {/* Decorative Corners */}
      <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-signal"></div>
      <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-signal"></div>
      <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-signal"></div>
      <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-signal"></div>

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-void/80 z-50 flex items-center justify-center backdrop-blur-sm">
            <div className="text-signal font-mono animate-pulse">FETCHING_DATA...</div>
        </div>
      )}

        <table className="w-full text-left font-mono border-collapse" style={{ fontSize: rowFontSize }}>
        <thead>
          <tr className="border-b border-ghost/30 bg-ghost/10">
            {columns.map((col, idx) => {
              const isSortable = !!col.sortKey && !!onSort;
              const isActive = sortKey === col.sortKey;
              return (
                <th key={idx}
                  className={cn(`${cellPy} px-4 text-gray-400 uppercase tracking-wider text-[11px] font-normal`, col.className, isSortable && "cursor-pointer hover:text-signal select-none group", onHeaderRightClick && "select-none")}
                  onClick={isSortable ? () => onSort!(col.sortKey!) : undefined}
                  onContextMenu={onHeaderRightClick ? (e) => { e.preventDefault(); onHeaderRightClick(col, e); } : undefined}>
                  <div className="flex items-center gap-1">
                    <span className={isActive ? "text-signal" : ""}>{col.header}</span>
                    {isSortable && (
                      <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                        {!isActive ? <ChevronsUpDown size={10} className="text-gray-600" /> : sortDir === 'ASC' ? <ChevronUp size={10} className="text-signal" /> : <ChevronDown size={10} className="text-signal" />}
                      </span>
                    )}
                    {isActive && (sortDir === 'ASC' ? <ChevronUp size={10} className="text-signal" /> : <ChevronDown size={10} className="text-signal" />)}
                  </div>
                </th>
              );
            })}
            <th className="w-10"></th>
          </tr>
        </thead>
        <tbody className="relative">
          <AnimatePresence initial={false}>
            {data.map((row) => {
              const rowColor = getRowColor ? getRowColor(row) : undefined;
              return (
              <motion.tr
                key={row.id}
                data-cb-id={String(row.id)}
                onClick={() => onRowClick && onRowClick(row)}
                onDoubleClick={() => onRowDoubleClick && onRowDoubleClick(row)}
                onContextMenu={(e) => { if (onRowContextMenu) { e.preventDefault(); onRowContextMenu(row, e); } }}
                className="border-b border-ghost/10 hover:bg-white/5 transition-colors group cursor-pointer"
                style={rowColor ? { borderLeftWidth: 3, borderLeftColor: rowColor, backgroundColor: rowColor + '08' } : undefined}
                layout
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{
                  opacity: 0,
                  x: 50,
                  backgroundColor: "rgba(220, 38, 38, 0.1)",
                  filter: "blur(5px)",
                  transition: { duration: 0.4, ease: "anticipate" }
                }}
                transition={{ duration: 0.3 }}
              >
                {columns.map((col, colIdx) => <td key={colIdx} className={`${cellPy} px-4 text-signal/80 group-hover:text-signal transition-colors`}>{colIdx === 0 && renderRowPrefix ? <span className="inline-flex items-center">{renderRowPrefix(row)}{col.cell ? col.cell(row) : (row[col.accessorKey as keyof T] as React.ReactNode)}</span> : (col.cell ? col.cell(row) : (row[col.accessorKey as keyof T] as React.ReactNode))}</td>)}
                <td className="pr-4 text-right"><ChevronRight size={16} className="text-gray-400 group-hover:text-signal opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0" /></td>
              </motion.tr>
              );
            })}
          </AnimatePresence>
          {data.length === 0 && !isLoading && (
            <tr>
              <td colSpan={columns.length + 1} className="py-12 text-center text-gray-400 italic">
                {emptyContent ?? 'NO_DATA_FOUND'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
