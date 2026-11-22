import dns from "dns/promises";
import net from "net";
import { isSafeExternalUrl, isSafeIpAddress } from "./ssrf";

export class SsrfBlockedError extends Error {
  code = "SSRF_BLOCKED";
  constructor(message: string) {
    super(message);
    this.name = "SsrfBlockedError";
  }
}

/**
 * Full server-side SSRF validation including asynchronous DNS resolution
 * to defeat DNS rebinding, nip.io/sslip.io/localtest.me, and internal host aliases.
 */
export async function isSafeExternalUrlAsync(rawUrl: string): Promise<boolean> {
  if (!isSafeExternalUrl(rawUrl)) return false;

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return false;
  }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.+$/, "");
  if (!host) return false;

  // If already an IP literal, validate directly
  if (net.isIP(host) !== 0) {
    return isSafeIpAddress(host);
  }

  // Resolve hostname via OS DNS and ensure ALL returned A/AAAA addresses are public
  try {
    const lookupPromise = dns.lookup(host, { all: true, verbatim: true });
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("DNS lookup timeout")), 4000)
    );
    const records = await Promise.race([lookupPromise, timeoutPromise]);
    if (!Array.isArray(records) || records.length === 0) {
      return false;
    }
    return records.every((rec) => rec && rec.address && isSafeIpAddress(rec.address));
  } catch {
    return false;
  }
}

/**
 * Safe HTTP/HTTPS fetch wrapper that:
 * - Validates DNS resolution before every hop (initial request + manual redirects)
 * - Enforces a single AbortController timeout spanning headers + body read via cleanup()
 */
export async function safeFetch(
  url: string,
  opts?: {
    headers?: Record<string, string>;
    timeoutMs?: number;
    maxRedirects?: number;
    next?: { revalidate?: number | false; tags?: string[] };
  }
): Promise<{ response: Response; finalUrl: string; cleanup: () => void }> {
  const timeoutMs = opts?.timeoutMs ?? 8000;
  const maxRedirects = opts?.maxRedirects ?? 5;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const cleanup = () => clearTimeout(timer);

  let currentUrl = url.trim();

  try {
    for (let hop = 0; hop <= maxRedirects; hop++) {
      const safe = await isSafeExternalUrlAsync(currentUrl);
      if (!safe) {
        throw new SsrfBlockedError(`Blocked unsafe target URL: ${currentUrl}`);
      }

      const fetchInit: RequestInit & { next?: { revalidate?: number | false; tags?: string[] } } = {
        headers: opts?.headers,
        redirect: "manual",
        signal: controller.signal,
      };
      if (opts?.next) {
        fetchInit.next = opts.next;
      }

      const res = await fetch(currentUrl, fetchInit);

      // Inspect redirects manually before following
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        try {
          await res.body?.cancel();
        } catch {}

        if (!location || hop === maxRedirects) {
          throw new SsrfBlockedError("Too many redirects or invalid redirect target");
        }

        let resolvedNext: string;
        try {
          resolvedNext = new URL(location, currentUrl).href;
        } catch {
          throw new SsrfBlockedError("Malformed redirect URL");
        }

        currentUrl = resolvedNext;
        continue;
      }

      return { response: res, finalUrl: currentUrl, cleanup };
    }

    throw new SsrfBlockedError("Too many redirects");
  } catch (err) {
    cleanup();
    throw err;
  }
}
