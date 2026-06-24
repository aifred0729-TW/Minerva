import { Layout } from 'react-grid-layout';

export const WIDGET_DIMENSIONS: Record<string, { w: number, h: number, minW?: number, minH?: number, maxH?: number }> = {
    kpiStrip: { w: 4, h: 3, minW: 2, minH: 2 },
    operationCountdown: { w: 2, h: 4, minW: 2, minH: 3 },
    activityHeatmap: { w: 2, h: 6, minW: 2, minH: 5 },
    taskStatusPie: { w: 1, h: 5, minW: 1, minH: 4 },
    topCommandsPie: { w: 1, h: 5, minW: 1, minH: 4 },
    c2Matrix: { w: 2, h: 5, minW: 2, minH: 4 },
    operationBriefing: { w: 2, h: 4, minW: 2, minH: 3 },
    liveFeed: { w: 2, h: 6, minW: 2, minH: 4 },
    recentPayloads: { w: 2, h: 6, minW: 2, minH: 4 },
    assetStrip: { w: 4, h: 3, minW: 2, minH: 2 },
    operatorsPanel: { w: 1, h: 5, minW: 1, minH: 4 },
    commandStats: { w: 3, h: 6, minW: 2, minH: 4 },
    hostContextPie: { w: 2, h: 5, minW: 1, minH: 4 },
    userContextPie: { w: 2, h: 5, minW: 1, minH: 4 },
    recentActivity: { w: 2, h: 6, minW: 2, minH: 4 },
    terminalLog: { w: 4, h: 6, minW: 2, minH: 4 },
};

function generatePackedLayout(keys: string[], cols: number = 4): Layout[] {
    const layout: Layout[] = [];
    const heights = new Array(cols).fill(0);
    
    for (const k of keys) {
        const dim = WIDGET_DIMENSIONS[k] || { w: 2, h: 4 };
        const w = Math.min(dim.w, cols);
        
        let bestX = 0;
        let bestY = Infinity;
        
        // Find the column with the minimum height that can fit the widget
        for (let x = 0; x <= cols - w; x++) {
            let y = 0;
            for (let c = 0; c < w; c++) {
                if (heights[x + c] > y) {
                    y = heights[x + c];
                }
            }
            if (y < bestY) {
                bestY = y;
                bestX = x;
            }
        }
        
        layout.push({
            i: k,
            x: bestX,
            y: bestY,
            w,
            h: dim.h,
            minW: dim.minW || 1,
            minH: dim.minH || 2
        });
        
        // Update column heights
        for (let c = 0; c < w; c++) {
            heights[bestX + c] = bestY + dim.h;
        }
    }
    return layout;
}

export const OPERATOR_LAYOUT = generatePackedLayout([
    'kpiStrip',
    'operationCountdown', 'taskStatusPie', 'topCommandsPie',
    'activityHeatmap', 'c2Matrix',
    'operationBriefing', 'liveFeed',
    'recentPayloads', 'assetStrip',
    'operatorsPanel', 'commandStats',
    'terminalLog',
]);

export const LEAD_LAYOUT = generatePackedLayout([
    'kpiStrip',
    'operationCountdown', 'taskStatusPie', 'topCommandsPie',
    'activityHeatmap', 'c2Matrix',
    'operationBriefing', 'hostContextPie', 'userContextPie',
    'operatorsPanel', 'commandStats',
    'liveFeed', 'recentPayloads',
    'assetStrip',
    'terminalLog',
]);
