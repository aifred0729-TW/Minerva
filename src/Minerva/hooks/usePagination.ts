import { useState, useMemo, useCallback } from 'react';

interface PaginationOptions {
    defaultPageSize?: number;
    pageSizeOptions?: number[];
}

interface PaginationState<T> {
    currentPage: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
    offset: number;
    /** Slice a local array for the current page */
    paginate: (items: T[]) => T[];
    setPage: (page: number) => void;
    setPageSize: (size: number) => void;
    setTotalCount: (count: number) => void;
    /** For GraphQL offset-based queries */
    queryVariables: { offset: number; limit: number };
    pageSizeOptions: number[];
}

export function usePagination<T = any>(opts: PaginationOptions = {}): PaginationState<T> {
    const { defaultPageSize = 20, pageSizeOptions = [20, 50, 100] } = opts;
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSizeRaw] = useState(defaultPageSize);
    const [totalCount, setTotalCount] = useState(0);

    const totalPages = useMemo(() => Math.max(1, Math.ceil(totalCount / pageSize)), [totalCount, pageSize]);
    const offset = useMemo(() => (currentPage - 1) * pageSize, [currentPage, pageSize]);

    const setPage = useCallback((page: number) => {
        setCurrentPage(Math.max(1, Math.min(page, Math.max(1, Math.ceil(totalCount / pageSize)))));
    }, [totalCount, pageSize]);

    const setPageSize = useCallback((size: number) => {
        setPageSizeRaw(size);
        setCurrentPage(1);
    }, []);

    const paginate = useCallback((items: T[]) => {
        return items.slice(offset, offset + pageSize);
    }, [offset, pageSize]);

    const queryVariables = useMemo(() => ({ offset, limit: pageSize }), [offset, pageSize]);

    return {
        currentPage,
        pageSize,
        totalCount,
        totalPages,
        offset,
        paginate,
        setPage,
        setPageSize,
        setTotalCount,
        queryVariables,
        pageSizeOptions,
    };
}
