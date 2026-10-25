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

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) return false;

  // Block localhost and internal hostnames
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "metadata.google.internal" ||
    host === "0.0.0.0" ||
    host === "::" ||
    host === "::1" ||
    host === "0:0:0:0:0:0:0:1" ||
    host === "0:0:0:0:0:0:0:0"
  ) {
    return false;
  }

  // Block IPv6 private (fc00::/7 -> fc.. or fd..), link-local (fe80::/10), and IPv4-mapped IPv6 (::ffff:...)
  if (host.includes(":")) {
    if (
      host.startsWith("fc") ||
      host.startsWith("fd") ||
      host.startsWith("fe8") ||
      host.startsWith("fe9") ||
      host.startsWith("fea") ||
      host.startsWith("feb") ||
      host.startsWith("::ffff:") ||
      host.startsWith("0:0:0:0:0:ffff:")
    ) {
      return false;
    }
    return true;
  }

  // Block single-integer / hex / octal IPv4 notations (e.g. 2130706433, 0x7f000001, 0177.0.0.1)
  if (/^\d+$/.test(host) || /^0x[0-9a-f]+$/i.test(host)) {
    return false;
  }

  // Check dotted IPv4 address ranges
  const ipv4Parts = host.split(".");
  if (ipv4Parts.every((p) => /^\d+$/.test(p) || /^0x[0-9a-f]+$/i.test(p))) {
    if (ipv4Parts.length !== 4) return false;
    // Reject leading zero octal notation in IPv4 octets
    if (ipv4Parts.some((p) => (p.length > 1 && p.startsWith("0")) || !/^\d+$/.test(p))) {
      return false;
    }
    const octets = ipv4Parts.map((p) => Number(p));
    if (octets.some((n) => isNaN(n) || n < 0 || n > 255)) return false;

    const [a, b] = octets;
    // 0.0.0.0/8, 10.0.0.0/8, 127.0.0.0/8
    if (a === 0 || a === 10 || a === 127) return false;
    // 100.64.0.0/10 (CGNAT)
    if (a === 100 && b >= 64 && b <= 127) return false;
    // 169.254.0.0/16 (Link-local / Cloud metadata)
    if (a === 169 && b === 254) return false;
    // 172.16.0.0/12 (Private)
    if (a === 172 && b >= 16 && b <= 31) return false;
    // 192.168.0.0/16 (Private)
    if (a === 192 && b === 168) return false;
    // 198.18.0.0/15 (Benchmark) & >= 224.0.0.0 (Multicast / Reserved)
    if ((a === 198 && (b === 18 || b === 19)) || a >= 224) return false;

    return true;
  }

  // Must have at least one dot for a public domain name
  if (!host.includes(".")) {
    return false;
  }

  return true;
}
