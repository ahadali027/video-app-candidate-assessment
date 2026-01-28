import { useRef, useState, useCallback } from 'react';
import axios from 'axios';
import { useSelector } from 'react-redux';

/**
 * useUploadProgress
 * - Provides real upload progress via XHR (axios) with AbortController cancellation.
 * - Default endpoint targets `${REACT_APP_BACKEND_URL}gallery/upload`.
 *
 * API:
 * const { upload, cancel, isUploading, lastError } = useUploadProgress();
 * await upload(formData, { onProgress?: (percent:number)=>void, endpoint?: string });
 * cancel() to abort the in-flight request.
 */
export const useUploadProgress = () => {
  const token = useSelector(state => state.auth?.token);
  const controllerRef = useRef(null);
  const [isUploading, setIsUploading] = useState(false);
  const [lastError, setLastError] = useState(null);

  const upload = useCallback(
    async (formData, { onProgress, endpoint } = {}) => {
      setIsUploading(true);
      setLastError(null);

      const base = process.env.REACT_APP_BACKEND_URL || '';
      const url = endpoint || `${base}gallery/upload`;

      // In dev, if we don't have a token or backend URL, treat this as a mock upload
      const isDev = process.env.NODE_ENV === 'development';
      const hasValidBackend =
        typeof base === 'string' &&
        base.length > 0 &&
        base !== 'undefined' &&
        base !== 'null';

      if (isDev && (!hasValidBackend || !token)) {
        // Simulate progress instantly and return a minimal result structure
        if (typeof onProgress === 'function') onProgress(100);
        setIsUploading(false);
        const file =
          formData instanceof FormData ? formData.get('file') || formData.get('image') : null;
        const mockUrl = file ? URL.createObjectURL(file) : null;
        return {
          data: mockUrl
            ? { url: mockUrl, file: { url: mockUrl, name: file.name, size: file.size } }
            : {},
        };
      }

      // Real network upload path (used in prod or when backend+token are configured)
      const controller = new AbortController();
      controllerRef.current = controller;

      try {
        const response = await axios.post(url, formData, {
          signal: controller.signal,
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          onUploadProgress: e => {
            if (e.total) {
              const percentage = Math.round((e.loaded * 100) / e.total);
              if (typeof onProgress === 'function') onProgress(percentage);
            }
          },
        });

        if (typeof onProgress === 'function') onProgress(100);
        return { data: response.data };
      } catch (error) {
        const isCanceled =
          (axios.isCancel && axios.isCancel(error)) ||
          error?.name === 'CanceledError' ||
          error?.message === 'canceled' ||
          error?.code === 'ERR_CANCELED';

        const wrapped = isCanceled ? { canceled: true, error } : { canceled: false, error };
        setLastError(wrapped);
        throw wrapped;
      } finally {
        setIsUploading(false);
        controllerRef.current = null;
      }
    },
    [token]
  );

  const cancel = useCallback(() => {
    if (controllerRef.current) {
      controllerRef.current.abort();
    }
  }, []);

  return { upload, cancel, isUploading, lastError };
};

export default useUploadProgress;