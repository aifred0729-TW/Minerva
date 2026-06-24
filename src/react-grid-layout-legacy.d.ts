// Type shim for the stable legacy API exported from react-grid-layout/legacy.
// The package uses subpath exports (package.json "exports"), which TypeScript with
// moduleResolution:node cannot resolve. The bundler (webpack/CRA) handles it fine.
declare module 'react-grid-layout/legacy' {
    import * as React from 'react';

    export interface LayoutItem {
        i: string;
        x: number;
        y: number;
        w: number;
        h: number;
        minW?: number;
        minH?: number;
        maxW?: number;
        maxH?: number;
        static?: boolean;
        isDraggable?: boolean;
        isResizable?: boolean;
    }

    export type Layout = readonly LayoutItem[];

    export interface ReactGridLayoutProps {
        children?: React.ReactNode;
        width?: number;
        autoSize?: boolean;
        cols?: number;
        rowHeight?: number;
        maxRows?: number;
        margin?: [number, number];
        containerPadding?: [number, number] | null;
        layout?: Layout;
        compactType?: 'vertical' | 'horizontal' | null;
        preventCollision?: boolean;
        isDraggable?: boolean;
        isResizable?: boolean;
        draggableHandle?: string;
        draggableCancel?: string;
        transformScale?: number;
        useCSSTransforms?: boolean;
        className?: string;
        style?: React.CSSProperties;
        innerRef?: React.Ref<HTMLDivElement>;
        onLayoutChange?: (layout: Layout) => void;
        onDragStart?: (...args: any[]) => void;
        onDrag?: (...args: any[]) => void;
        onDragStop?: (...args: any[]) => void;
        onResizeStart?: (...args: any[]) => void;
        onResize?: (...args: any[]) => void;
        onResizeStop?: (...args: any[]) => void;
    }

    export interface WidthProviderProps {
        measureBeforeMount?: boolean;
        className?: string;
    }

    export function WidthProvider<P extends { width?: number }>(
        component: React.ComponentType<P>
    ): React.ComponentType<Omit<P, 'width'> & WidthProviderProps>;

    declare function ReactGridLayout(props: ReactGridLayoutProps): React.ReactElement;
    export { ReactGridLayout };
    export default ReactGridLayout;
}
