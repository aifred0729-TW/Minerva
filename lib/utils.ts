import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function b64DecodeUnicode(str: string): string {
  if (!str || str.length === 0) { return "" }
  try {
    const text = window.atob(str);
    const length = text.length;
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
        bytes[i] = text.charCodeAt(i);
    }
    const decoder = new TextDecoder(); // default is utf-8
    return decoder.decode(bytes);
  } catch (error) {
    try {
      return decodeURIComponent(window.atob(str));
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
