/**
 * Blocks SSRF by rejecting URLs that point to private/reserved IP space or
 * use a non-HTTPS scheme. Used wherever the app fetches a caller-controlled URL.
 *
 * Does not perform DNS resolution — prevents IP-literal SSRF and scheme abuse.
 * DNS rebinding is a separate concern requiring network-level controls.
 */

type SsrfResult = { ok: true; url: URL } | { ok: false; reason: string };

export function isSsrfSafe(rawUrl: string): SsrfResult {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "Invalid URL" };
  }

  if (url.protocol !== "https:") {
    return { ok: false, reason: "Only HTTPS URLs are allowed" };
  }

  if (isPrivateHost(url.hostname)) {
    return { ok: false, reason: "URL points to a private or reserved address" };
  }

  return { ok: true, url };
}

function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase();

  // Named loopback / internal hostnames
  if (h === "localhost" || h === "0.0.0.0") return true;
  if (
    h.endsWith(".local") ||
    h.endsWith(".localhost") ||
    h.endsWith(".internal") ||
    h.endsWith(".corp") ||
    h.endsWith(".home") ||
    h.endsWith(".lan")
  ) {
    return true;
  }

  // Strip IPv6 brackets that the URL spec requires (e.g. [::1])
  const bare = h.startsWith("[") && h.endsWith("]") ? h.slice(1, -1) : h;

  // IPv4: match dotted-decimal and check against private/reserved CIDR blocks.
  // Only treat as IPv4 when all four octets are in the valid 0–255 range —
  // strings like "999.0.0.1" are not valid IP addresses and should fall through.
  const v4 = bare.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b, c, d] = [Number(v4[1]), Number(v4[2]), Number(v4[3]), Number(v4[4])];
    if (a > 255 || b > 255 || c > 255 || d > 255) return false; // not a valid IPv4
    return (
      a === 0 || // 0.0.0.0/8 — "this" network
      a === 10 || // 10.0.0.0/8 — private
      a === 127 || // 127.0.0.0/8 — loopback
      (a === 100 && b >= 64 && b <= 127) || // 100.64.0.0/10 — CGNAT
      (a === 169 && b === 254) || // 169.254.0.0/16 — link-local (EC2 IMDS lives here)
      (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12 — private
      (a === 192 && b === 0 && c === 0) || // 192.0.0.0/24 — IETF protocol
      (a === 192 && b === 0 && c === 2) || // 192.0.2.0/24 — TEST-NET-1
      (a === 192 && b === 168) || // 192.168.0.0/16 — private
      (a === 198 && (b === 18 || b === 19)) || // 198.18.0.0/15 — benchmarking
      (a === 198 && b === 51 && c === 100) || // 198.51.100.0/24 — TEST-NET-2
      (a === 203 && b === 0 && c === 113) || // 203.0.113.0/24 — TEST-NET-3
      a >= 240 // 240.0.0.0/4 — reserved + broadcast
    );
  }

  // IPv6: check loopback, link-local, ULA, unspecified, and IPv4-mapped
  if (bare === "::" || bare === "::1") return true; // unspecified / loopback

  const firstGroup = parseInt(bare.split(":")[0] || "0", 16);
  if (!isNaN(firstGroup)) {
    if (firstGroup >= 0xfe80 && firstGroup <= 0xfebf) return true; // fe80::/10 link-local
    if (firstGroup >= 0xfc00 && firstGroup <= 0xfdff) return true; // fc00::/7 ULA
  }

  if (/^::ffff:/i.test(bare)) {
    // IPv4-mapped — extract the embedded IPv4 address and recurse.
    // Node.js normalizes dotted-decimal notation to two hex groups (e.g.
    // "::ffff:169.254.169.254" → "::ffff:a9fe:a9fe"), so handle both forms.
    const embedded = bare.slice("::ffff:".length);
    if (embedded.includes(".")) {
      return isPrivateHost(embedded);
    }
    // Two hex groups: convert back to dotted-decimal
    const parts = embedded.split(":");
    if (parts.length === 2) {
      const hi = parseInt(parts[0], 16);
      const lo = parseInt(parts[1], 16);
      if (!isNaN(hi) && !isNaN(lo)) {
        const ipv4 = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
        return isPrivateHost(ipv4);
      }
    }
    return false;
  }

  return false;
}
