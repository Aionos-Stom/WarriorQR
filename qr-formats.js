/**
 * Constructores de contenido para cada tipo de código QR.
 * Cada función devuelve el string exacto que se codifica en el QR,
 * siguiendo los formatos estándar (WIFI:, vCard 3.0, mailto:, tel:/smsto:).
 */
const QRFormats = (() => {
  "use strict";

  function escapeWifi(value) {
    return String(value || "").replace(/([\\;,:])/g, "\\$1");
  }

  function escapeVCard(value) {
    return String(value || "")
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\r\n|\r|\n/g, "\\n");
  }

  function buildText(fields) {
    return String(fields.content || "").trim();
  }

  function buildWifi(fields) {
    const ssid = escapeWifi(fields.ssid);
    const password = fields.security === "nopass" ? "" : `P:${escapeWifi(fields.password)};`;
    const hidden = fields.hidden ? "H:true;" : "";
    return `WIFI:T:${fields.security};S:${ssid};${password}${hidden};`;
  }

  function buildVCard(fields) {
    const fullName = String(fields.name || "").trim();
    const parts = fullName.split(/\s+/);
    const firstName = parts[0] || "";
    const lastName = parts.slice(1).join(" ");

    const lines = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      `N:${escapeVCard(lastName)};${escapeVCard(firstName)};;;`,
      `FN:${escapeVCard(fullName)}`
    ];
    if (fields.org) lines.push(`ORG:${escapeVCard(fields.org)}`);
    if (fields.phone) lines.push(`TEL;TYPE=CELL:${escapeVCard(fields.phone)}`);
    if (fields.email) lines.push(`EMAIL:${escapeVCard(fields.email)}`);
    if (fields.url) lines.push(`URL:${escapeVCard(fields.url)}`);
    lines.push("END:VCARD");
    return lines.join("\n");
  }

  function buildEmail(fields) {
    const to = String(fields.to || "").trim();
    const parts = [];
    if (fields.subject) parts.push(`subject=${encodeURIComponent(fields.subject)}`);
    if (fields.body) parts.push(`body=${encodeURIComponent(fields.body)}`);
    const query = parts.join("&");
    return `mailto:${to}${query ? `?${query}` : ""}`;
  }

  function buildPhone(fields) {
    const phone = String(fields.phone || "").trim();
    if (fields.kind === "sms") {
      const message = fields.message ? `:${encodeURIComponent(fields.message)}` : "";
      return `smsto:${phone}${message}`;
    }
    return `tel:${phone}`;
  }

  const BUILDERS = {
    text: buildText,
    wifi: buildWifi,
    vcard: buildVCard,
    email: buildEmail,
    phone: buildPhone
  };

  function build(type, fields) {
    const builder = BUILDERS[type] || buildText;
    return builder(fields);
  }

  return { build, escapeWifi, escapeVCard };
})();
