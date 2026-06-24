/**
 * CollapsibleOutput — folds long terminal output behind a "show more"
 * affordance.
 *
 * Used by TaskBlock's plain-text response fallback. When the rendered
 * output exceeds `lineThreshold` (or `charThreshold`) the component
 * renders only the first `previewLines` lines and a single button
 * showing how many lines are hidden. Clicking expands; clicking again
 * collapses.
 *
 * The component intentionally keeps its own state — each task block
 * remembers whether the operator expanded it for the lifetime of that
 * row. Errors are exempt from collapsing because their text is usually
 * short and immediately actionable.
 */
import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '../../lib/utils';

interface Props {
    text: string;
    isError?: boolean;
    /** Show all when total lines ≤ this. Default 30. */
    lineThreshold?: number;
    /** Show all when total chars ≤ this. Default 4000. */
    charThreshold?: number;
    /** When folded, render this many lines from the top. Default 8. */
    previewLines?: number;
}

export function CollapsibleOutput({
    text,
    isError = false,
    lineThreshold = 30,
    charThreshold = 4000,
    previewLines = 8,
}: Props) {
    const [expanded, setExpanded] = useState(false);

    const { lines, hiddenCount, needsFold } = useMemo(() => {
        const all = text.split('\n');
        const isLong = all.length > lineThreshold || text.length > charThreshold;
        const needs = isLong && !isError;
        return {
            lines: all,
            hiddenCount: Math.max(0, all.length - previewLines),
            needsFold: needs,
        };
    }, [text, lineThreshold, charThreshold, previewLines, isError]);

    const visible = !needsFold || expanded ? lines : lines.slice(0, previewLines);

    return (
        <div className={cn('mb-1', isError && 'text-red-400 border-l-2 border-red-500/50 pl-2')}>
            {visible.map((line, i) => (
                <div key={i}>{line || <br />}</div>
            ))}
            {needsFold && !expanded && (
                <button
                    onClick={() => setExpanded(true)}
                    className="mt-1 flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-mono text-signal border border-signal/30 hover:bg-signal/10 hover:text-accent transition-colors rounded-sm"
                    title="Expand the rest of this response"
                >
                    <ChevronDown size={11} />
                    Show {hiddenCount} more line{hiddenCount === 1 ? '' : 's'}
                    <span className="text-signal/80">·</span>
                    <span className="text-signal/80 tabular-nums">{lines.length} total</span>
                </button>
            )}
            {needsFold && expanded && (
                <button
                    onClick={() => setExpanded(false)}
                    className="mt-1 flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-mono text-signal border border-signal/30 hover:bg-signal/10 hover:text-accent transition-colors rounded-sm"
                    title="Hide the long output"
                >
                    <ChevronUp size={11} />
                    Collapse · {lines.length} lines
                </button>
            )}
        </div>
    );
}
