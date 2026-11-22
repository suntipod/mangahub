/**
 * Safe URI decoding that never throws URIError on malformed percent-encoded sequences.
 */
export function safeDecodeURIComponent(str: string): string {
  if (!str) return "";
  try {
    return decodeURIComponent(str);
  } catch {
    return str;
  }
}

/**
 * Checks whether a hostname matches a domain (or is a subdomain of it),
 * safely ignoring trailing dots.
 */
export function hostnameMatches(hostname: string, domain: string): boolean {
  const h = (hostname || "").toLowerCase().replace(/^\[|\]$/g, "").replace(/\.+$/, "");
  const d = (domain || "").toLowerCase().replace(/^\[|\]$/g, "").replace(/\.+$/, "");
  if (!h || !d) return false;
  return h === d || h.endsWith("." + d);
}

function isSafeIpv4Octets(octets: number[]): boolean {
  if (octets.length !== 4 || octets.some((n) => isNaN(n) || n < 0 || n > 255)) {
    return false;
  }
  const [a, b] = octets;
  // 0.0.0.0/8, 10.0.0.0/8, 127.0.0.0/8
  if (a === 0 || a === 10 || a === 127) return false;
  // 100.64.0.0/10 (CGNAT)
  if (a === 100 && b >= 64 && b <= 127) return false;
  // 169.254.0.0/16 (Link-local / Cloud metadata)
  if (a === 169 && b === 254) return false;
  // 172.16.0.0/12 (Private)
  if (a === 172 && b >= 16 && b <= 31) return false;
  // 192.0.0.0/24, 192.0.2.0/24, 192.168.0.0/16
  if (a === 192 && b === 0) return false;
  if (a === 192 && b === 168) return false;
  // 198.18.0.0/15 (Benchmark), 198.51.100.0/24, 203.0.113.0/24
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && octets[2] === 100) return false;
  if (a === 203 && b === 0 && octets[2] === 113) return false;
  // >= 224.0.0.0 (Multicast / Reserved / Broadcast)
  if (a >= 224) return false;
  return true;
}

function expandIpv6ToHextets(rawIp: string): number[] | null {
  if (!rawIp || rawIp.includes("%")) return null;
  let ip = rawIp.toLowerCase().replace(/^\[|\]$/g, "");

  // Convert trailing embedded IPv4 (e.g. ::ffff:127.0.0.1 or ::127.0.0.1)
  if (ip.includes(".")) {
    const lastColon = ip.lastIndexOf(":");
    if (lastColon === -1) return null;
    const ipv4Str = ip.slice(lastColon + 1);
    const v4Parts = ipv4Str.split(".");
    if (v4Parts.length !== 4 || !v4Parts.every((p) => /^\d+$/.test(p))) return null;
    const octets = v4Parts.map(Number);
    if (octets.some((n) => n < 0 || n > 255)) return null;
    const hHigh = ((octets[0] << 8) | octets[1]).toString(16);
    const hLow = ((octets[2] << 8) | octets[3]).toString(16);
    const prefix = ip.slice(0, lastColon + 1);
    ip = `${prefix}${hHigh}:${hLow}`;
  }

  const dblParts = ip.split("::");
  if (dblParts.length > 2) return null;

  const parseGroups = (part: string): number[] | null => {
    if (!part) return [];
    const groups = part.split(":");
    const nums: number[] = [];
    for (const g of groups) {
      if (!/^[0-9a-f]{1,4}$/i.test(g)) return null;
      nums.push(parseInt(g, 16));
    }
    return nums;
  };

  if (dblParts.length === 2) {
    const left = parseGroups(dblParts[0]);
    const right = parseGroups(dblParts[1]);
    if (!left || !right) return null;
    const missing = 8 - (left.length + right.length);
    if (missing < 1) return null;
    return [...left, ...new Array(missing).fill(0), ...right];
  }

  const full = parseGroups(ip);
  if (!full || full.length !== 8) return null;
  return full;
}

/**
 * Validates that a raw IPv4 or IPv6 address string is publicly routable.
 */
export function isSafeIpAddress(rawIp: string): boolean {
  if (!rawIp || typeof rawIp !== "string") return false;
  const ip = rawIp.trim().toLowerCase().replace(/^\[|\]$/g, "");

  if (ip.includes(":")) {
    const hextets = expandIpv6ToHextets(ip);
    if (!hextets) return false;
    const [h0, h1] = hextets;
    // Only allow IPv6 Global Unicast (2000::/3)
    if (h0 < 0x2000 || h0 > 0x3fff) return false;
    // Block Teredo (2001::/32), Documentation (2001:db8::/32), and 6to4 (2002::/16)
    if (h0 === 0x2001 && (h1 === 0x0000 || h1 === 0x0db8)) return false;
    if (h0 === 0x2002) return false;
    return true;
  }

  const parts = ip.split(".");
  if (parts.length !== 4) return false;
  if (parts.some((p) => !/^\d+$/.test(p) || (p.length > 1 && p.startsWith("0")))) {
    return false;
  }
  return isSafeIpv4Octets(parts.map(Number));
}

/**
 * Validates that a URL is a safe public HTTP/HTTPS URL and not targeting
 * loopback, private RFC1918 networks, link-local (AWS/cloud metadata 169.254.169.254),
 * or internal hostnames (SSRF protection).
 */
export function isSafeExternalUrl(rawUrl: string): boolean {
  if (!rawUrl || typeof rawUrl !== "string") return false;
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return false;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return false;
  }

  // Reject embedded credentials
  if (parsed.username || parsed.password) {
    return false;
  }

  // Strip IPv6 brackets and trailing FQDN dots (e.g. "localhost." -> "localhost")
  const rawHost = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const host = rawHost.replace(/\.+$/, "");
  if (!host || host.startsWith(".") || host.includes("..")) {
    return false;
  }

  // Block localhost and internal hostnames
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "metadata.google.internal" ||
    host === "metadata.goog"
  ) {
    return false;
  }

  // IPv6 literal
  if (host.includes(":")) {
    return isSafeIpAddress(host);
  }

  // Block single-integer / hex / octal IPv4 notations (e.g. 2130706433, 0x7f000001)
  if (/^\d+$/.test(host) || /^0x[0-9a-f]+$/i.test(host)) {
    return false;
  }

  // Check numeric dotted IPv4 address ranges (including octal/hex octet bypass attempts)
  const ipv4Parts = host.split(".");
  if (ipv4Parts.every((p) => /^\d+$/.test(p) || /^0x[0-9a-f]+$/i.test(p))) {
    return isSafeIpAddress(host);
  }

  // Must have at least one dot for a public domain name
  if (!host.includes(".")) {
    return false;
  }

  return true;
}

/**
 * Sanitizes external links for UI rendering (<a href>, window.open), blocking
 * dangerous schemes like javascript:, data:, vbscript:, file:.
 */
export function toSafeHttpUrl(rawUrl?: string | null): string | null {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  let candidate = trimmed;
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(candidate)) {
    // Only prepend https:// if input looks like a domain name (never for relative/scheme strings)
    if (/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:[/:?#]|$)/.test(candidate)) {
      candidate = `https://${candidate}`;
    } else {
      return null;
    }
  }

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.href;
  } catch {
    return null;
  }
}

/**
 * Removes ad/tracking and Cloudflare challenge parameters from external manga URLs.
 */
export function stripTrackingParams(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== "string") return "";
  try {
    const u = new URL(rawUrl.trim());
    const keysToDelete: string[] = [];
    u.searchParams.forEach((_, key) => {
      if (/^(?:fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|ref_src|utm_[a-z0-9_]+|__cf_chl_[a-z0-9_]+)$/i.test(key)) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach((k) => u.searchParams.delete(k));
    return u.href;
  } catch {
    return rawUrl.trim();
  }
}
