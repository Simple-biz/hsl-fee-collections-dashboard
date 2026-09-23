import { describe, it, expect } from "vitest";
import { isSsrfSafe } from "@/lib/ssrf-guard";

describe("isSsrfSafe", () => {
  // --- allowed URLs ---
  it("allows a public HTTPS URL", () => {
    const r = isSsrfSafe("https://storage.chroniclelegal.com/files/abc.pdf");
    expect(r.ok).toBe(true);
  });

  it("allows an S3 presigned URL", () => {
    const r = isSsrfSafe(
      "https://my-bucket.s3.amazonaws.com/docs/file.pdf?X-Amz-Signature=abc&X-Amz-Expires=3600",
    );
    expect(r.ok).toBe(true);
  });

  it("allows a public HTTPS URL with port", () => {
    const r = isSsrfSafe("https://cdn.example.com:8443/file.pdf");
    expect(r.ok).toBe(true);
  });

  // --- scheme violations ---
  it("blocks HTTP URLs", () => {
    const r = isSsrfSafe("http://chroniclelegal.com/file.pdf");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/https/i);
  });

  it("blocks file:// URLs", () => {
    const r = isSsrfSafe("file:///etc/passwd");
    expect(r.ok).toBe(false);
  });

  it("blocks ftp:// URLs", () => {
    const r = isSsrfSafe("ftp://files.example.com/file.pdf");
    expect(r.ok).toBe(false);
  });

  // --- named private hosts ---
  it("blocks localhost", () => {
    expect(isSsrfSafe("https://localhost/secret").ok).toBe(false);
  });

  it("blocks .local hostnames", () => {
    expect(isSsrfSafe("https://server.local/path").ok).toBe(false);
  });

  it("blocks .internal hostnames", () => {
    expect(isSsrfSafe("https://metadata.internal/computeMetadata/v1").ok).toBe(false);
  });

  it("blocks .corp hostnames", () => {
    expect(isSsrfSafe("https://secret.corp/admin").ok).toBe(false);
  });

  // --- IPv4 private ranges ---
  it("blocks 127.0.0.1 loopback", () => {
    expect(isSsrfSafe("https://127.0.0.1/admin").ok).toBe(false);
  });

  it("blocks 127.x.x.x loopback range", () => {
    expect(isSsrfSafe("https://127.255.255.1/").ok).toBe(false);
  });

  it("blocks 10.x.x.x private range", () => {
    expect(isSsrfSafe("https://10.0.0.1/").ok).toBe(false);
    expect(isSsrfSafe("https://10.255.100.1/").ok).toBe(false);
  });

  it("blocks 172.16–31.x.x private range", () => {
    expect(isSsrfSafe("https://172.16.0.1/").ok).toBe(false);
    expect(isSsrfSafe("https://172.31.255.255/").ok).toBe(false);
  });

  it("does not block 172.15.x.x (outside private range)", () => {
    expect(isSsrfSafe("https://172.15.0.1/").ok).toBe(true);
  });

  it("does not block 172.32.x.x (outside private range)", () => {
    expect(isSsrfSafe("https://172.32.0.1/").ok).toBe(true);
  });

  it("blocks 192.168.x.x private range", () => {
    expect(isSsrfSafe("https://192.168.1.1/").ok).toBe(false);
  });

  it("blocks 169.254.x.x link-local (EC2 IMDS)", () => {
    expect(isSsrfSafe("https://169.254.169.254/latest/meta-data/").ok).toBe(false);
  });

  it("blocks 0.0.0.0", () => {
    expect(isSsrfSafe("https://0.0.0.0/").ok).toBe(false);
  });

  // --- IPv6 private ranges ---
  it("blocks ::1 loopback", () => {
    expect(isSsrfSafe("https://[::1]/").ok).toBe(false);
  });

  it("blocks :: unspecified", () => {
    expect(isSsrfSafe("https://[::]/").ok).toBe(false);
  });

  it("blocks fe80::/10 link-local", () => {
    expect(isSsrfSafe("https://[fe80::1]/").ok).toBe(false);
    expect(isSsrfSafe("https://[febf::1]/").ok).toBe(false);
  });

  it("does not block fec0:: (site-local, deprecated but not link-local)", () => {
    // fec0 is outside fe80::/10 — we accept it (public routing)
    expect(isSsrfSafe("https://[fec0::1]/").ok).toBe(true);
  });

  it("blocks fc00::/7 ULA (fc and fd prefixes)", () => {
    expect(isSsrfSafe("https://[fc00::1]/").ok).toBe(false);
    expect(isSsrfSafe("https://[fd12:3456::1]/").ok).toBe(false);
  });

  it("blocks IPv4-mapped IPv6 with private embedded address", () => {
    expect(isSsrfSafe("https://[::ffff:169.254.169.254]/").ok).toBe(false);
    expect(isSsrfSafe("https://[::ffff:10.0.0.1]/").ok).toBe(false);
  });

  it("allows IPv4-mapped IPv6 with public embedded address", () => {
    expect(isSsrfSafe("https://[::ffff:8.8.8.8]/").ok).toBe(true);
  });

  // --- malformed input ---
  it("rejects a non-URL string", () => {
    const r = isSsrfSafe("not-a-url");
    expect(r.ok).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isSsrfSafe("").ok).toBe(false);
  });
});
