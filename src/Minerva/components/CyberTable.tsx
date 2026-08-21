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
  /** Height of the internal scroll area. The design language wants lists to
   *  scroll inside their own container so page chrome never moves. */
  maxHeight?: string;
  /**
   * `instrument` drops the table's own frame — outer border, corner ticks — and
   * moves its palette onto the signal/void tokens, for use inside an
   * `InstrumentPanel` that already supplies the frame. Two borders around one
   * list is a box in a box, and the L-shaped corner ticks are HUD decoration
   * that DESIGN_LANGUAGE.md scopes to the link panel.
   *
   * Left as an opt-in rather than a rewrite of the default: this table is on
   * eight other pages that have not been through the same pass, and a silent
   * restyle of all of them is not what any one of those tasks asked for.
   */
  variant?: 'default' | 'instrument';
}

/**
 * Above this many rows the table renders only what is on screen.
 *
 * Measured before choosing: the largest single operation on a real instance
 * holds 64 callbacks, most hold under 40. Windowing is therefore the *smaller*
 * of the two wins here and will not even engage for most operations — it is in
 * place for the case that outgrows the page, not for today's data.
 *
 * The bigger win is unconditional, below: see LAYOUT ANIMATION.
 */
const WINDOW_THRESHOLD = 60;

/** Rows are assumed uniform; this is the fallback until one is measured. */
const ESTIMATED_ROW_HEIGHT = 33;

/** Extra rows rendered above and below the viewport, so a fast scroll does not
 *  reach the edge of the rendered window before the next frame lands. */
const OVERSCAN = 8;

export function CyberTable<T extends { id: number | string }>({
  data, columns, onRowClick, onRowDoubleClick, onRowContextMenu, onHeaderRightClick,
  isLoading, emptyContent, getRowColor, sortKey, sortDir, onSort, rowFontSize = 12,
  renderRowPrefix, maxHeight = '62vh', variant = 'default',
}: CyberTableProps<T>) {
  const instrument = variant === 'instrument';
  const cellPy = rowFontSize <= 10 ? 'py-1' : rowFontSize >= 16 ? 'py-4' : rowFontSize >= 14 ? 'py-3' : 'py-2';

  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const bodyRef = React.useRef<HTMLTableSectionElement | null>(null);
  const [scrollTop, setScrollTop] = React.useState(0);
  const [viewportH, setViewportH] = React.useState(0);
  const [rowH, setRowH] = React.useState(ESTIMATED_ROW_HEIGHT);

  const windowed = data.length > WINDOW_THRESHOLD;

  // Measure a real row rather than trusting the estimate — padding scales with
  // `rowFontSize`, so the correct height is a runtime fact, not a constant.
  //
  // `rowH` is deliberately NOT a dependency, and is compared through a ref.
  // With it in the list the effect re-ran on its own output: a new rowH shifts
  // which row is first, the effect measures that different row, and if the two
  // differ by more than a pixel the pair oscillate until React throws
  // "Maximum update depth exceeded".
  const rowHRef = React.useRef(rowH);
  rowHRef.current = rowH;
  React.useLayoutEffect(() => {
    if (!windowed) return;
    const firstRow = bodyRef.current?.querySelector('tr[data-row]') as HTMLElement | null;
    const h = firstRow?.offsetHeight;
    if (h && Math.abs(h - rowHRef.current) > 1) setRowH(h);
  }, [windowed, rowFontSize, data.length]);

  React.useEffect(() => {
    if (!windowed) return;
    const el = scrollRef.current;
    if (!el) return;
    // Scroll fires far more often than the screen repaints; without
    // coalescing, every event was a setState and a full table re-render.
    let raf: number | null = null;
    const sync = () => {
      if (raf !== null) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        setScrollTop(el.scrollTop);
        setViewportH(el.clientHeight);
      });
    };
    setScrollTop(el.scrollTop);
    setViewportH(el.clientHeight);
    el.addEventListener('scroll', sync, { passive: true });
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => {
      if (raf !== null) cancelAnimationFrame(raf);
      el.removeEventListener('scroll', sync);
      ro.disconnect();
    };
  }, [windowed]);

  const total = data.length;
  // Clamped against `total`, not just against zero. `scrollTop` survives a data
  // change, so when a filter or a poll shortens the list while the operator is
  // scrolled down, an unclamped `first` overshoots the new end: `total - first`
  // goes negative, the slice reverses into an empty array, and the table shows
  // a multi-thousand-pixel column of nothing until the browser happens to clamp
  // the scroll position for us.
  const first = windowed
    ? Math.min(Math.max(0, Math.floor(scrollTop / rowH) - OVERSCAN), Math.max(0, total - 1))
    : 0;
  const visibleCount = windowed
    ? Math.max(0, Math.min(total - first, Math.ceil((viewportH || 600) / rowH) + OVERSCAN * 2))
    : total;
  const last = windowed ? first + visibleCount : total;
  const padTop = windowed ? first * rowH : 0;
  const padBottom = windowed ? Math.max(0, (total - last) * rowH) : 0;
  const slice = windowed ? data.slice(first, last) : data;

  const colCount = columns.length + 1;

  const renderRow = (row: T) => {
    const rowColor = getRowColor ? getRowColor(row) : undefined;
    const cells = (
      <>
        {columns.map((col, colIdx) => (
          <td key={colIdx} className={`${cellPy} px-4 text-signal/80 group-hover:text-signal transition-colors`}>
            {colIdx === 0 && renderRowPrefix
              ? <span className="inline-flex items-center">{renderRowPrefix(row)}{col.cell ? col.cell(row) : (row[col.accessorKey as keyof T] as React.ReactNode)}</span>
              : (col.cell ? col.cell(row) : (row[col.accessorKey as keyof T] as React.ReactNode))}
          </td>
        ))}
        <td className="pr-4 text-right">
          <ChevronRight size={16} className={cn(
            'opacity-0 transition-all -translate-x-2 group-hover:translate-x-0 group-hover:opacity-100',
            instrument ? 'text-signal' : 'text-gray-400 group-hover:text-signal',
          )} />
        </td>
      </>
    );

    const shared = {
      'data-row': true,
      'data-cb-id': String(row.id),
      onClick: () => onRowClick && onRowClick(row),
      onDoubleClick: () => onRowDoubleClick && onRowDoubleClick(row),
      onContextMenu: (e: React.MouseEvent) => { if (onRowContextMenu) { e.preventDefault(); onRowContextMenu(row, e); } },
      className: cn(
        'group cursor-pointer transition-colors',
        instrument
          ? 'border-b border-signal/10 hover:bg-signal/5'
          : 'border-b border-ghost/10 hover:bg-white/5',
      ),
      style: rowColor ? { borderLeftWidth: 3, borderLeftColor: rowColor, backgroundColor: rowColor + '08' } : undefined,
    };

    // Windowed rows mount and unmount as the operator scrolls, so an entry
    // animation would fire on scroll rather than on arrival — the row would
    // appear to slide in every time it re-entered the viewport.
    if (windowed) return <tr key={row.id} {...shared}>{cells}</tr>;

    // LAYOUT ANIMATION: deliberately absent.
    //
    // Every row used to carry framer-motion's `layout` prop, which measures
    // that row's box in a layout effect on every commit where the projection
    // might have moved. On a table that re-renders on each filter keystroke,
    // each sort, and each 10s refresh, that is a forced synchronous layout read
    // per row per render — paid at every size, not just large ones, and paid to
    // animate rows sliding a few pixels during a sort.
    //
    // Entry and exit stay: they run once, on mount and unmount, and they are
    // what makes a callback going away legible rather than abrupt.
    return (
      <motion.tr
        key={row.id}
        {...shared}
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{
          opacity: 0,
          x: 50,
          backgroundColor: 'rgba(220, 38, 38, 0.1)',
          filter: 'blur(5px)',
          transition: { duration: 0.4, ease: 'anticipate' },
        }}
        transition={{ duration: 0.3 }}
      >
        {cells}
      </motion.tr>
    );
  };

  return (
    <div className={cn(
      'relative w-full overflow-hidden bg-void',
      instrument ? 'flex h-full min-h-0 flex-col' : 'border border-ghost/30',
    )}>
      {/* Decorative Corners — default frame only; the instrument variant is
          framed by the panel around it. */}
      {!instrument && (
        <>
          <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-signal z-20"></div>
          <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-signal z-20"></div>
          <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-signal z-20"></div>
          <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-signal z-20"></div>
        </>
      )}

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-void/80 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className={cn(
            'font-mono text-signal animate-pulse',
            instrument && 'text-[11px] font-bold uppercase tracking-[0.18em]',
          )}>{instrument ? 'Fetching data' : 'FETCHING_DATA...'}</div>
        </div>
      )}

      <div
        ref={scrollRef}
        className={cn('cyber-scrollbar overflow-y-auto', instrument && 'min-h-0 flex-1')}
        // Always bounded, not only past the windowing threshold: the docstring
        // promises lists scroll in their own container so page chrome never
        // moves, and a 60-row table growing the page while a 61-row one snaps
        // to 62vh is exactly the jump that promise rules out.
        style={{ maxHeight }}
      >
        <table className="w-full text-left font-mono border-collapse" style={{ fontSize: rowFontSize }}>
          <thead className="sticky top-0 z-10">
            {/* The rule is on the cells, not the row: with border-collapse a
                row's own border does not travel with it when it sticks. */}
            <tr className={instrument ? 'bg-void' : 'bg-ghost/10'}>
              {columns.map((col, idx) => {
                const isSortable = !!col.sortKey && !!onSort;
                const isActive = sortKey === col.sortKey;
                return (
                  <th key={idx}
                    className={cn(
                      `${cellPy} px-4 bg-void uppercase`,
                      instrument
                        ? 'border-b border-signal/20 text-[10px] font-bold tracking-[0.16em] text-signal'
                        : 'border-b border-ghost/30 text-[11px] font-normal tracking-wider text-gray-400',
                      col.className,
                      isSortable && "cursor-pointer hover:text-signal select-none group",
                      onHeaderRightClick && "select-none",
                    )}
                    onClick={isSortable ? () => onSort!(col.sortKey!) : undefined}
                    onContextMenu={onHeaderRightClick ? (e) => { e.preventDefault(); onHeaderRightClick(col, e); } : undefined}>
                    <div className="flex items-center gap-1">
                      <span className={isActive ? "text-accent" : ""}>{col.header}</span>
                      {isSortable && (
                        <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                          {!isActive ? <ChevronsUpDown size={10} className={instrument ? 'text-signal opacity-50' : 'text-gray-600'} /> : sortDir === 'ASC' ? <ChevronUp size={10} className="text-accent" /> : <ChevronDown size={10} className="text-accent" />}
                        </span>
                      )}
                      {isActive && (sortDir === 'ASC' ? <ChevronUp size={10} className="text-accent" /> : <ChevronDown size={10} className="text-accent" />)}
                    </div>
                  </th>
                );
              })}
              <th className={cn('w-10 bg-void border-b', instrument ? 'border-signal/20' : 'border-ghost/30')}></th>
            </tr>
          </thead>
          <tbody ref={bodyRef} className="relative">
            {/* Spacers stand in for the rows that are not rendered, so the
                scrollbar still reports the true length of the list. */}
            {padTop > 0 && <tr aria-hidden="true" style={{ height: padTop }}><td colSpan={colCount} /></tr>}

            {windowed
              ? slice.map(renderRow)
              : <AnimatePresence initial={false}>{slice.map(renderRow)}</AnimatePresence>}

            {padBottom > 0 && <tr aria-hidden="true" style={{ height: padBottom }}><td colSpan={colCount} /></tr>}

            {data.length === 0 && !isLoading && (
              <tr>
                <td colSpan={colCount} className={cn('py-12 text-center italic', instrument ? 'text-signal opacity-70' : 'text-gray-400')}>
                  {emptyContent ?? 'NO_DATA_FOUND'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
