import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

interface Column<T> {
  header: string;
  accessorKey?: keyof T;
  cell?: (item: T) => React.ReactNode;
  className?: string;
}

interface CyberTableProps<T> {
  data: T[];
  columns: Column<T>[];
  onRowClick?: (item: T) => void;
  isLoading?: boolean;
}

export function CyberTable<T extends { id: number | string }>({ data, columns, onRowClick, isLoading }: CyberTableProps<T>) {
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

      <table className="w-full text-left font-mono text-sm border-collapse">
        <thead>
          <tr className="border-b border-ghost/30 bg-ghost/10">
            {columns.map((col, idx) => <th key={idx} className={cn("py-3 px-4 text-gray-400 uppercase tracking-wider text-xs font-normal", col.className)}>{col.header}</th>)}
            <th className="w-10"></th>
          </tr>
        </thead>
        <tbody className="relative">
          <AnimatePresence initial={false}>
            {data.map((row) => (
              <motion.tr
                key={row.id}
                onClick={() => onRowClick && onRowClick(row)}
                className="border-b border-ghost/10 hover:bg-white/5 transition-colors group cursor-pointer"
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
                {columns.map((col, colIdx) => <td key={colIdx} className="py-3 px-4 text-signal/80 group-hover:text-signal transition-colors">{col.cell ? col.cell(row) : (row[col.accessorKey as keyof T] as React.ReactNode)}</td>)}
                <td className="pr-4 text-right"><ChevronRight size={16} className="text-gray-400 group-hover:text-signal opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0" /></td>
              </motion.tr>
            ))}
          </AnimatePresence>
          {data.length === 0 && !isLoading && (
            <tr>
              <td colSpan={columns.length + 1} className="py-12 text-center text-gray-400 italic">NO_DATA_FOUND</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
