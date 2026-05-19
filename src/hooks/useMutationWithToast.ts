import {
  useMutation,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";
import { toast } from "sonner";

type ToastMessage<T, V> = string | ((data: T, vars: V) => string);
type ErrorMessage<V> = string | ((error: Error, vars: V) => string);

export interface MutationToastOptions<TData, TVars> {
  /** Toast on success. Omit to skip. Function form receives mutation result + vars. */
  success?: ToastMessage<TData, TVars>;
  /** Toast on error. Defaults to error.message. Set to false to skip entirely. */
  error?: ErrorMessage<TVars> | false;
  /** Description shown beneath the success toast. */
  description?: ToastMessage<TData, TVars>;
}

/**
 * Wraps `useMutation` with sonner toasts so callers don't repeat
 * onSuccess/onError → toast.success/toast.error in every component.
 *
 * Preserves any onSuccess/onError the caller passes; the toast fires before
 * the caller's handler runs.
 */
export function useMutationWithToast<
  TData,
  TError extends Error,
  TVars,
  TOnMutateResult,
>(
  options: UseMutationOptions<TData, TError, TVars, TOnMutateResult> &
    MutationToastOptions<TData, TVars>,
): UseMutationResult<TData, TError, TVars, TOnMutateResult> {
  const {
    success,
    error,
    description,
    onSuccess,
    onError,
    ...mutationOptions
  } = options;

  return useMutation<TData, TError, TVars, TOnMutateResult>({
    ...mutationOptions,
    onSuccess: (data, vars, onMutateResult, ctx) => {
      if (success !== undefined) {
        const msg = typeof success === "function" ? success(data, vars) : success;
        const desc =
          typeof description === "function"
            ? description(data, vars)
            : description;
        toast.success(msg, desc ? { description: desc } : undefined);
      }
      return onSuccess?.(data, vars, onMutateResult, ctx);
    },
    onError: (err, vars, onMutateResult, ctx) => {
      if (error !== false) {
        const msg =
          typeof error === "function"
            ? error(err, vars)
            : (error ?? err.message ?? "Something went wrong");
        toast.error(msg);
      }
      return onError?.(err, vars, onMutateResult, ctx);
    },
  });
}
