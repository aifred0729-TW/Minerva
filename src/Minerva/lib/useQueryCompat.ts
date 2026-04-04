/**
 * Apollo Client 4 removed onCompleted/onError from useQuery and useLazyQuery.
 * These wrappers re-add that behavior for backward compatibility.
 */
import { useEffect, useRef, useCallback } from 'react';
import { useQuery, useLazyQuery } from '@apollo/client/react';
import type { DocumentNode, TypedDocumentNode, OperationVariables } from '@apollo/client';

type CompatOptions<TData, TVars extends OperationVariables> =
  Parameters<typeof useQuery<TData, TVars>>[1] & {
    onCompleted?: (data: TData) => void;
    onError?: (error: Error) => void;
  };

export function useQueryCompat<
  TData = unknown,
  TVars extends OperationVariables = OperationVariables,
>(
  query: DocumentNode | TypedDocumentNode<TData, TVars>,
  options?: CompatOptions<TData, TVars>,
) {
  const opts = (options ?? {}) as any;
  const { onCompleted, onError, ...rest } = opts;

  const result = useQuery<TData, TVars>(query, rest);

  // Refs to avoid stale closures and extra effect runs
  const onCompletedRef = useRef(onCompleted);
  const onErrorRef = useRef(onError);
  onCompletedRef.current = onCompleted;
  onErrorRef.current = onError;

  // Track whether we've already fired for this data/error identity
  const firedDataRef = useRef<unknown>(undefined);
  const firedErrorRef = useRef<Error | undefined>(undefined);

  useEffect(() => {
    if (
      result.data !== undefined &&
      !result.loading &&
      result.data !== firedDataRef.current
    ) {
      firedDataRef.current = result.data;
      onCompletedRef.current?.(result.data as TData);
    }
  }, [result.data, result.loading]);

  useEffect(() => {
    if (result.error && result.error !== firedErrorRef.current) {
      firedErrorRef.current = result.error;
      onErrorRef.current?.(result.error);
    }
  }, [result.error]);

  return result;
}

/**
 * useLazyQuery compat wrapper: re-adds onCompleted/onError via .then()/.catch()
 * on the execute function return value.
 */
type LazyCompatOptions<TData, TVars extends OperationVariables> =
  Parameters<typeof useLazyQuery<TData, TVars>>[1] & {
    onCompleted?: (data: TData) => void;
    onError?: (error: Error) => void;
  };

export function useLazyQueryCompat<
  TData = any,
  TVars extends OperationVariables = OperationVariables,
>(
  query: DocumentNode | TypedDocumentNode<TData, TVars>,
  options?: LazyCompatOptions<TData, TVars>,
) {
  const { onCompleted, onError, ...rest } = (options ?? {}) as LazyCompatOptions<TData, TVars>;

  const onCompletedRef = useRef(onCompleted);
  const onErrorRef = useRef(onError);
  onCompletedRef.current = onCompleted;
  onErrorRef.current = onError;

  const [executeFn, result] = useLazyQuery<TData, TVars>(
    query,
    rest as Parameters<typeof useLazyQuery<TData, TVars>>[1],
  );

  const wrappedExecute = useCallback(
    (...args: Parameters<typeof executeFn>) => {
      const promise = executeFn(...args);
      promise.then((res) => {
        if (res.data) {
          onCompletedRef.current?.(res.data as TData);
        }
        if (res.error) {
          onErrorRef.current?.(res.error);
        }
      }).catch((err) => {
        onErrorRef.current?.(err);
      });
      return promise;
    },
    [executeFn],
  );

  return [wrappedExecute, result] as const;
}
