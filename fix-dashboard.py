import re

with open('/opt/Minerva/src/Minerva/pages/Dashboard.tsx', 'r') as f:
    content = f.read()

# 1. Add imports
content = content.replace("import { cn } from '../lib/utils';",
"""import { cn } from '../lib/utils';
import { Responsive, WidthProvider, Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { OPERATOR_LAYOUT, LEAD_LAYOUT, WIDGET_DIMENSIONS } from '../lib/dashboardLayouts';

const ResponsiveGridLayout = WidthProvider(Responsive);""")


# 2. Add custom layout code right before loadCustomWidgets()
content = content.replace("function loadCustomWidgets", """function loadCustomLayout(): Layout[] {
    try {
        const stored = localStorage.getItem('minerva-custom-layout');
        if (stored) return JSON.parse(stored);
    } catch {}
    const keys = ALL_WIDGETS.map(w => w.key);
    let y = 0;
    return keys.map((k, i) => {
        const dim = WIDGET_DIMENSIONS[k] || { w: 2, h: 3 };
        const h = dim.h;
        y += h;
        return { i: k, x: (i * 2) % 4, y: y, w: Math.min(dim.w, 4), h, minW: dim.minW, minH: dim.minH };
    });
}
function saveCustomLayout(layout: Layout[]) {
    try { localStorage.setItem('minerva-custom-layout', JSON.stringify(layout)); } catch {}
}

function loadCustomWidgets""")


# 3. Add customLayout state
content = content.replace("const [customWidgets, setCustomWidgets] = useState<WidgetKey[]>(loadCustomWidgets);",
"""const [customWidgets, setCustomWidgets] = useState<WidgetKey[]>(loadCustomWidgets);
    const [customLayout, setCustomLayout] = useState<Layout[]>(loadCustomLayout);""")

# Also in toggleWidget, make sure RGL item gets added to customLayout
content = content.replace("""const toggleWidget = useCallback((key: WidgetKey) => {
        setCustomWidgets(prev => {
            const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key];
            saveCustomWidgets(next);
            return next;
        });
    }, []);""", """const toggleWidget = useCallback((key: WidgetKey) => {
        setCustomWidgets(prev => {
            const active = prev.includes(key);
            const next = active ? prev.filter(k => k !== key) : [...prev, key];
            saveCustomWidgets(next);
            
            if (!active) {
                // Add to layout if not exists
                setCustomLayout(cl => {
                    if (cl.find(l => l.i === key)) return cl;
                    const dim = WIDGET_DIMENSIONS[key] || { w: 2, h: 3 };
                    const newLayout = [...cl, { i: key, x: 0, y: 999, w: Math.min(dim.w, 4), h: dim.h, minW: dim.minW, minH: dim.minH }];
                    saveCustomLayout(newLayout);
                    return newLayout;
                });
            }
            return next;
        });
    }, []);""")


# 4. Replace the grid layout render section
old_grid = """
                            {/* Main Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                                {visibleWidgets.map(w => (
                                    <motion.div key={w.key} variants={item} className={COL_SPAN[w.cols] || 'lg:col-span-1'}>
                                        {renderWidget(w.key)}
                                    </motion.div>
                                ))}
                            </div>
"""

new_grid = """
                            {/* Main Dashboard Layout */}
                            <div className="-mx-2 mt-2">
                                <ResponsiveGridLayout
                                    className="layout"
                                    layouts={{
                                        lg: perspective === 'operator' ? OPERATOR_LAYOUT 
                                            : perspective === 'lead' ? LEAD_LAYOUT 
                                            : customLayout
                                    }}
                                    breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
                                    cols={{ lg: 4, md: 4, sm: 2, xs: 1, xxs: 1 }}
                                    rowHeight={65}
                                    containerPadding={[0, 0]}
                                    margin={[20, 20]}
                                    isDraggable={perspective === 'custom' && editing}
                                    isResizable={perspective === 'custom' && editing}
                                    onLayoutChange={(lyt) => {
                                        if (perspective === 'custom') {
                                            setCustomLayout(lyt);
                                            saveCustomLayout(lyt);
                                        }
                                    }}
                                    useCSSTransforms={true}
                                >
                                    {visibleWidgets.map(w => (
                                        <div key={w.key} className={perspective === 'custom' && editing ? "cursor-move" : ""}>
                                            {renderWidget(w.key)}
                                        </div>
                                    ))}
                                </ResponsiveGridLayout>
                            </div>
"""

content = content.replace(old_grid, new_grid)

with open('/opt/Minerva/src/Minerva/pages/Dashboard.tsx', 'w') as f:
    f.write(content)

