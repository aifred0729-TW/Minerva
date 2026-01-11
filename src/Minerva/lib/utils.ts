import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function b64DecodeUnicode(str: string): string {
  if (!str || str.length === 0) { return "" }
  try {
    // Convert URL-safe base64 to standard base64
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    // Add padding if necessary
    const pad = base64.length % 4;
    if (pad) {
      base64 += '='.repeat(4 - pad);
    }
    
    const text = window.atob(base64);
    const length = text.length;
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
        bytes[i] = text.charCodeAt(i);
    }
    const decoder = new TextDecoder(); // default is utf-8
    return decoder.decode(bytes);
  } catch (error) {
    try {
      // Fallback: try URL-safe conversion again
      let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
      const pad = base64.length % 4;
      if (pad) {
        base64 += '='.repeat(4 - pad);
      }
      return decodeURIComponent(window.atob(base64));
    } catch (error2) {
      try {
        return window.atob(str);
      } catch (error3) {
        // console.log("Failed to base64 decode response", error, error2)
        return str;
      }
    }
  }
}

export function b64EncodeUnicode(str: string): string {
  if (!str || str.length === 0) { return "" }
  try {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  } catch (error) {
    try {
      return window.btoa(encodeURIComponent(str));
    } catch (error2) {
      return window.btoa(str);
    }
  }
}
