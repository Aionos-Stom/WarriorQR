(() => {
  "use strict";

  const els = {};
  let qrInstance;
  let currentType = "text";
  let phoneKind = "call";
  let logoDataUrl = "";
  let isGenerated = false;

  let bgMode = "color";
  let bgImage = null;
  let emojiLayout = [];

  const MAX_LOGO_BYTES = 5 * 1024 * 1024;
  const MAX_BG_IMAGE_BYTES = 8 * 1024 * 1024;
  const RENDER_SIZE = 1000;
  const TYPE_LABELS = {
    text: "Texto / URL",
    wifi: "WiFi",
    vcard: "Contacto",
    email: "Email",
    phone: "Teléfono"
  };

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    Object.assign(els, {
      typeButtons: [...document.querySelectorAll(".type-button")],
      typeFieldGroups: [...document.querySelectorAll(".type-fields")],

      textContent: document.getElementById("field-text-content"),
      charCount: document.getElementById("char-count"),

      wifiSsid: document.getElementById("field-wifi-ssid"),
      wifiSecurity: document.getElementById("field-wifi-security"),
      wifiPassword: document.getElementById("field-wifi-password"),
      wifiPasswordGroup: document.getElementById("wifi-password-group"),
      wifiHidden: document.getElementById("field-wifi-hidden"),

      vcardName: document.getElementById("field-vcard-name"),
      vcardOrg: document.getElementById("field-vcard-org"),
      vcardPhone: document.getElementById("field-vcard-phone"),
      vcardEmail: document.getElementById("field-vcard-email"),
      vcardUrl: document.getElementById("field-vcard-url"),

      emailTo: document.getElementById("field-email-to"),
      emailSubject: document.getElementById("field-email-subject"),
      emailBody: document.getElementById("field-email-body"),

      phoneKindButtons: [...document.querySelectorAll("[data-phone-kind]")],
      phoneNumber: document.getElementById("field-phone-number"),
      phoneMessage: document.getElementById("field-phone-message"),
      phoneMessageGroup: document.getElementById("phone-message-group"),

      logoToggle: document.getElementById("logo-toggle"),
      logoSection: document.getElementById("logo-section"),
      logoInput: document.getElementById("logo-input"),
      logoPreviewRow: document.getElementById("logo-preview-row"),
      selectedLogoImage: document.getElementById("selected-logo-image"),
      selectedLogoName: document.getElementById("selected-logo-name"),
      selectedLogoSize: document.getElementById("selected-logo-size"),
      removeLogo: document.getElementById("remove-logo"),
      logoSize: document.getElementById("logo-size"),
      logoSizeOutput: document.getElementById("logo-size-output"),

      qrColor: document.getElementById("qr-color"),
      qrColorText: document.getElementById("qr-color-text"),
      backgroundColor: document.getElementById("background-color"),
      backgroundColorText: document.getElementById("background-color-text"),

      bgModeButtons: [...document.querySelectorAll("[data-bg-mode]")],
      bgFieldGroups: [...document.querySelectorAll(".bg-fields")],
      bgImageInput: document.getElementById("bg-image-input"),
      bgImageTitle: document.getElementById("bg-image-title"),
      bgImageOpacity: document.getElementById("bg-image-opacity"),
      bgImageOpacityOutput: document.getElementById("bg-image-opacity-output"),
      bgEmojiChars: document.getElementById("bg-emoji-chars"),
      bgEmojiSize: document.getElementById("bg-emoji-size"),
      bgEmojiSizeOutput: document.getElementById("bg-emoji-size-output"),
      bgEmojiOpacity: document.getElementById("bg-emoji-opacity"),
      bgEmojiOpacityOutput: document.getElementById("bg-emoji-opacity-output"),

      generateButton: document.getElementById("generate-button"),
      downloadPng: document.getElementById("download-png"),
      downloadSvg: document.getElementById("download-svg"),
      resetButton: document.getElementById("reset-button"),
      canvas: document.getElementById("qr-canvas"),
      renderCanvas: document.getElementById("qr-render-canvas"),
      emptyState: document.getElementById("empty-state"),
      modeBadge: document.getElementById("mode-badge"),
      message: document.getElementById("message"),
      year: document.getElementById("year"),

      historyList: document.getElementById("history-list"),
      clearHistory: document.getElementById("clear-history")
    });

    els.year.textContent = new Date().getFullYear();
    els.charCount.textContent = `${els.textContent.value.length}/2000`;

    if (typeof QRCodeStyling === "undefined") {
      showMessage("No se pudo cargar el generador. Recarga la página.", "error");
      els.generateButton.disabled = true;
      return;
    }

    bindEvents();
    updateQr(true);
    renderHistory();
    registerServiceWorker();
  }

  // ---------- Tipo de contenido ----------

  function switchType(type) {
    currentType = type;
    els.typeButtons.forEach(button => {
      const active = button.dataset.type === type;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    els.typeFieldGroups.forEach(group => {
      const active = group.dataset.typeFields === type;
      group.classList.toggle("hidden", !active);
      group.setAttribute("aria-hidden", String(!active));
    });
    els.modeBadge.textContent = TYPE_LABELS[type] || type;
    clearMessage();
  }

  function collectFields() {
    switch (currentType) {
      case "wifi":
        return {
          ssid: els.wifiSsid.value.trim(),
          security: els.wifiSecurity.value,
          password: els.wifiPassword.value,
          hidden: els.wifiHidden.checked
        };
      case "vcard":
        return {
          name: els.vcardName.value.trim(),
          org: els.vcardOrg.value.trim(),
          phone: els.vcardPhone.value.trim(),
          email: els.vcardEmail.value.trim(),
          url: els.vcardUrl.value.trim()
        };
      case "email":
        return {
          to: els.emailTo.value.trim(),
          subject: els.emailSubject.value.trim(),
          body: els.emailBody.value.trim()
        };
      case "phone":
        return {
          kind: phoneKind,
          phone: els.phoneNumber.value.trim(),
          message: els.phoneMessage.value.trim()
        };
      default:
        return { content: els.textContent.value.trim() };
    }
  }

  function applyFields(type, fields) {
    switchType(type);
    switch (type) {
      case "wifi":
        els.wifiSsid.value = fields.ssid || "";
        els.wifiSecurity.value = fields.security || "WPA";
        els.wifiPassword.value = fields.password || "";
        els.wifiHidden.checked = Boolean(fields.hidden);
        updateWifiPasswordVisibility();
        break;
      case "vcard":
        els.vcardName.value = fields.name || "";
        els.vcardOrg.value = fields.org || "";
        els.vcardPhone.value = fields.phone || "";
        els.vcardEmail.value = fields.email || "";
        els.vcardUrl.value = fields.url || "";
        break;
      case "email":
        els.emailTo.value = fields.to || "";
        els.emailSubject.value = fields.subject || "";
        els.emailBody.value = fields.body || "";
        break;
      case "phone":
        phoneKind = fields.kind === "sms" ? "sms" : "call";
        updatePhoneKindUi();
        els.phoneNumber.value = fields.phone || "";
        els.phoneMessage.value = fields.message || "";
        break;
      default:
        els.textContent.value = fields.content || "";
        els.charCount.textContent = `${els.textContent.value.length}/2000`;
    }
  }

  function validate(type, fields) {
    if (type === "text" && !fields.content) {
      return "Escribe un texto o enlace para generar el código QR.";
    }
    if (type === "wifi" && !fields.ssid) {
      return "Escribe el nombre de la red (SSID).";
    }
    if (type === "vcard" && !fields.name) {
      return "Escribe al menos el nombre del contacto.";
    }
    if (type === "email" && !fields.to) {
      return "Escribe el correo del destinatario.";
    }
    if (type === "phone" && !fields.phone) {
      return "Escribe un número de teléfono.";
    }
    return "";
  }

  function buildLabel(type, fields) {
    switch (type) {
      case "wifi": return `WiFi: ${fields.ssid}`;
      case "vcard": return fields.name || "Contacto";
      case "email": return `Email a ${fields.to}`;
      case "phone": return `${fields.kind === "sms" ? "SMS a" : "Llamar a"} ${fields.phone}`;
      default: return fields.content.length > 42 ? `${fields.content.slice(0, 42)}…` : fields.content;
    }
  }

  // ---------- QR ----------

  function buildQrOptions(data, backgroundColor) {
    const withLogo = els.logoToggle.checked && Boolean(logoDataUrl);

    return {
      width: RENDER_SIZE,
      height: RENDER_SIZE,
      type: "svg",
      data,
      image: withLogo ? logoDataUrl : undefined,
      margin: 40,
      qrOptions: {
        typeNumber: 0,
        mode: "Byte",
        errorCorrectionLevel: withLogo ? "H" : "Q"
      },
      imageOptions: {
        hideBackgroundDots: true,
        imageSize: Number(els.logoSize?.value || 22) / 100,
        margin: 12,
        crossOrigin: "anonymous",
        saveAsBlob: true
      },
      dotsOptions: {
        color: els.qrColor?.value || "#111827",
        type: "rounded"
      },
      backgroundOptions: {
        color: backgroundColor
      },
      cornersSquareOptions: {
        color: els.qrColor?.value || "#111827",
        type: "extra-rounded"
      },
      cornersDotOptions: {
        color: els.qrColor?.value || "#111827",
        type: "dot"
      }
    };
  }

  function drawBackgroundLayer(ctx) {
    ctx.clearRect(0, 0, RENDER_SIZE, RENDER_SIZE);

    if (bgMode === "color") {
      ctx.fillStyle = els.backgroundColor?.value || "#ffffff";
      ctx.fillRect(0, 0, RENDER_SIZE, RENDER_SIZE);
      return;
    }

    if (bgMode === "transparent") {
      return;
    }

    if (bgMode === "image" && bgImage) {
      const opacity = Number(els.bgImageOpacity?.value || 55) / 100;
      const scale = Math.max(RENDER_SIZE / bgImage.naturalWidth, RENDER_SIZE / bgImage.naturalHeight);
      const drawW = bgImage.naturalWidth * scale;
      const drawH = bgImage.naturalHeight * scale;
      const offsetX = (RENDER_SIZE - drawW) / 2;
      const offsetY = (RENDER_SIZE - drawH) / 2;
      ctx.globalAlpha = opacity;
      ctx.drawImage(bgImage, offsetX, offsetY, drawW, drawH);
      ctx.globalAlpha = 1;
      return;
    }

    if (bgMode === "emoji" && emojiLayout.length) {
      const opacity = Number(els.bgEmojiOpacity?.value || 35) / 100;
      ctx.globalAlpha = opacity;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      emojiLayout.forEach(item => {
        ctx.save();
        ctx.translate(item.x, item.y);
        ctx.rotate(item.rot);
        ctx.font = `${item.size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
        ctx.fillText(item.char, 0, 0);
        ctx.restore();
      });
      ctx.globalAlpha = 1;
    }
  }

  function regenerateEmojiLayout() {
    const raw = (els.bgEmojiChars?.value || "").trim();
    const chars = raw.length ? raw.split(/\s+/).slice(0, 12) : ["🎉"];
    const size = Number(els.bgEmojiSize?.value || 36);
    const step = size * 1.5;
    const layout = [];

    for (let y = step / 2; y < RENDER_SIZE; y += step) {
      for (let x = step / 2; x < RENDER_SIZE; x += step) {
        const jitterX = (Math.random() - 0.5) * step * 0.3;
        const jitterY = (Math.random() - 0.5) * step * 0.3;
        layout.push({
          x: x + jitterX,
          y: y + jitterY,
          char: chars[Math.floor(Math.random() * chars.length)],
          size: size * (0.85 + Math.random() * 0.3),
          rot: (Math.random() - 0.5) * 0.6
        });
      }
    }
    emojiLayout = layout;
  }

  async function compositeAndRender(data) {
    const ctx = els.renderCanvas.getContext("2d");

    const transparentOptions = buildQrOptions(data, "transparent");
    if (!qrInstance) {
      qrInstance = new QRCodeStyling(transparentOptions);
    } else {
      qrInstance.update(transparentOptions);
    }

    drawBackgroundLayer(ctx);

    const blob = await qrInstance.getRawData("png");
    const bitmap = await createImageBitmap(blob);
    ctx.drawImage(bitmap, 0, 0, RENDER_SIZE, RENDER_SIZE);
  }

  async function updateQr(initial) {
    const fields = collectFields();
    const error = validate(currentType, fields);

    if (error) {
      isGenerated = false;
      els.canvas.classList.add("hidden");
      els.emptyState.classList.remove("hidden");
      setDownloadState(false);
      if (!initial) showMessage(error, "error");
      return;
    }

    const data = QRFormats.build(currentType, fields);

    els.emptyState.classList.add("hidden");
    els.canvas.classList.remove("hidden");

    try {
      await compositeAndRender(data);
    } catch (err) {
      console.error(err);
      showMessage("No se pudo generar el código QR. Inténtalo de nuevo.", "error");
      return;
    }

    isGenerated = true;
    setDownloadState(true);

    if (!initial) {
      showMessage("Código QR actualizado correctamente.", "success");
      WarriorHistory.add({
        type: currentType,
        data,
        label: buildLabel(currentType, fields),
        fields
      }).then(renderHistory);
    }
  }

  function downloadCanvasPng(filenameBase) {
    return new Promise((resolve, reject) => {
      els.renderCanvas.toBlob(blob => {
        if (!blob) { reject(new Error("No se pudo generar el PNG.")); return; }
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${filenameBase}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        resolve();
      }, "image/png");
    });
  }

  async function download(extension) {
    if (!isGenerated) return;

    const filenameBase = els.logoToggle.checked && logoDataUrl ? "WarriorQR-con-logo" : "WarriorQR";

    if (extension === "svg" && (bgMode === "image" || bgMode === "emoji")) {
      showMessage("SVG no está disponible con fondo de imagen o emojis — descarga en PNG.", "error");
      return;
    }

    try {
      if (extension === "png") {
        await downloadCanvasPng(filenameBase);
      } else {
        const fields = collectFields();
        const data = QRFormats.build(currentType, fields);
        const svgColor = bgMode === "transparent" ? "transparent" : (els.backgroundColor?.value || "#ffffff");
        const svgInstance = new QRCodeStyling(buildQrOptions(data, svgColor));
        await svgInstance.download({ name: filenameBase, extension: "svg" });
      }
      showMessage(`Tu archivo ${extension.toUpperCase()} se descargó correctamente.`, "success");
    } catch (error) {
      console.error(error);
      showMessage("No se pudo descargar el archivo. Inténtalo nuevamente.", "error");
    }
  }

  // ---------- Historial ----------

  function renderHistory() {
    WarriorHistory.list().then(items => {
      if (!items.length) {
        els.historyList.innerHTML = '<p class="history-empty">Aún no has generado ningún código.</p>';
        return;
      }

      els.historyList.innerHTML = "";
      items.forEach(item => {
        const row = document.createElement("div");
        row.className = "history-item";

        const info = document.createElement("div");
        info.className = "history-info";
        const badge = document.createElement("span");
        badge.className = "history-type-badge";
        badge.textContent = TYPE_LABELS[item.type] || item.type;
        const label = document.createElement("strong");
        label.textContent = item.label || "";
        const time = document.createElement("small");
        time.textContent = new Date(item.ts).toLocaleString();
        info.append(badge, label, time);

        const actions = document.createElement("div");
        actions.className = "history-actions";

        const useButton = document.createElement("button");
        useButton.type = "button";
        useButton.className = "text-button";
        useButton.textContent = "Usar";
        useButton.addEventListener("click", () => {
          applyFields(item.type, item.fields || {});
          updateQr(false);
          window.scrollTo({ top: 0, behavior: "smooth" });
        });

        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "icon-button";
        deleteButton.setAttribute("aria-label", "Eliminar del historial");
        deleteButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"></path></svg>';
        deleteButton.addEventListener("click", () => {
          WarriorHistory.remove(item.id).then(renderHistory);
        });

        actions.append(useButton, deleteButton);
        row.append(info, actions);
        els.historyList.appendChild(row);
      });
    });
  }

  // ---------- Logo ----------

  function handleLogo(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const allowed = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
    if (!allowed.includes(file.type)) {
      clearLogo();
      showMessage("Selecciona un logo PNG, JPG, WEBP o SVG.", "error");
      return;
    }

    if (file.size > MAX_LOGO_BYTES) {
      clearLogo();
      showMessage("El logo supera el máximo permitido de 5 MB.", "error");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      logoDataUrl = String(reader.result);
      els.selectedLogoImage.src = logoDataUrl;
      els.selectedLogoName.textContent = file.name;
      els.selectedLogoSize.textContent = formatBytes(file.size);
      els.logoPreviewRow.classList.remove("hidden");
      showMessage("Logo cargado correctamente.", "success");
      if (isGenerated) updateQr(false);
    };
    reader.onerror = () => showMessage("No fue posible leer la imagen seleccionada.", "error");
    reader.readAsDataURL(file);
  }

  function clearLogo() {
    logoDataUrl = "";
    els.logoInput.value = "";
    els.selectedLogoImage.removeAttribute("src");
    els.logoPreviewRow.classList.add("hidden");
    if (isGenerated) updateQr(false);
  }

  // ---------- Fondo del QR ----------

  function switchBgMode(mode) {
    bgMode = mode;
    els.bgModeButtons.forEach(button => {
      const active = button.dataset.bgMode === mode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-checked", String(active));
    });
    els.bgFieldGroups.forEach(group => {
      const active = group.id === `bg-${mode}-fields`;
      group.classList.toggle("hidden", !active);
    });

    if (mode === "emoji" && !emojiLayout.length) regenerateEmojiLayout();
    if (isGenerated) updateQr(false);
  }

  function handleBgImage(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const allowed = ["image/png", "image/jpeg", "image/webp"];
    if (!allowed.includes(file.type)) {
      showMessage("Selecciona una imagen PNG, JPG o WEBP.", "error");
      return;
    }
    if (file.size > MAX_BG_IMAGE_BYTES) {
      showMessage("La imagen de fondo supera el máximo permitido de 8 MB.", "error");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        bgImage = img;
        els.bgImageTitle.textContent = file.name;
        showMessage("Imagen de fondo cargada.", "success");
        if (isGenerated) updateQr(false);
      };
      img.onerror = () => showMessage("No fue posible leer la imagen seleccionada.", "error");
      img.src = String(reader.result);
    };
    reader.onerror = () => showMessage("No fue posible leer la imagen seleccionada.", "error");
    reader.readAsDataURL(file);
  }

  function clearBgImage() {
    bgImage = null;
    els.bgImageInput.value = "";
    els.bgImageTitle.textContent = "Selecciona una imagen de fondo";
  }

  // ---------- Helpers de UI ----------

  function linkColorInputs(picker, text) {
    picker.addEventListener("input", () => {
      text.value = picker.value.toUpperCase();
      if (isGenerated) updateQr(false);
    });

    text.addEventListener("input", () => {
      const normalized = normalizeHex(text.value);
      if (normalized) {
        picker.value = normalized;
        if (isGenerated) updateQr(false);
      }
    });

    text.addEventListener("blur", () => {
      text.value = picker.value.toUpperCase();
    });
  }

  function normalizeHex(value) {
    const trimmed = value.trim();
    const candidate = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
    return /^#[0-9a-fA-F]{6}$/.test(candidate) ? candidate : "";
  }

  function updateWifiPasswordVisibility() {
    const isOpen = els.wifiSecurity.value === "nopass";
    els.wifiPasswordGroup.classList.toggle("hidden", isOpen);
  }

  function updatePhoneKindUi() {
    els.phoneKindButtons.forEach(button => {
      const active = button.dataset.phoneKind === phoneKind;
      button.classList.toggle("active", active);
      button.setAttribute("aria-checked", String(active));
    });
    els.phoneMessageGroup.classList.toggle("hidden", phoneKind !== "sms");
  }

  function setDownloadState(enabled) {
    els.downloadPng.disabled = !enabled;
    els.downloadSvg.disabled = !enabled || bgMode === "image" || bgMode === "emoji";
  }

  function showMessage(text, type) {
    els.message.textContent = text;
    els.message.className = `message ${type}`;
  }

  function clearMessage() {
    els.message.textContent = "";
    els.message.className = "message";
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function resetForm() {
    switchType("text");
    els.textContent.value = "";
    els.charCount.textContent = "0/2000";

    els.wifiSsid.value = "";
    els.wifiSecurity.value = "WPA";
    els.wifiPassword.value = "";
    els.wifiHidden.checked = false;
    updateWifiPasswordVisibility();

    els.vcardName.value = "";
    els.vcardOrg.value = "";
    els.vcardPhone.value = "";
    els.vcardEmail.value = "";
    els.vcardUrl.value = "";

    els.emailTo.value = "";
    els.emailSubject.value = "";
    els.emailBody.value = "";

    phoneKind = "call";
    updatePhoneKindUi();
    els.phoneNumber.value = "";
    els.phoneMessage.value = "";

    els.qrColor.value = "#111827";
    els.qrColorText.value = "#111827";
    els.backgroundColor.value = "#ffffff";
    els.backgroundColorText.value = "#FFFFFF";
    switchBgMode("color");
    clearBgImage();
    els.bgImageOpacity.value = "55";
    els.bgImageOpacityOutput.textContent = "55%";
    els.bgEmojiChars.value = "🎉 ✨ 💫";
    els.bgEmojiSize.value = "36";
    els.bgEmojiSizeOutput.textContent = "36px";
    els.bgEmojiOpacity.value = "35";
    els.bgEmojiOpacityOutput.textContent = "35%";
    emojiLayout = [];
    els.logoSize.value = "22";
    els.logoSizeOutput.textContent = "22%";
    els.logoToggle.checked = false;
    els.logoSection.classList.add("hidden");
    els.logoSection.setAttribute("aria-hidden", "true");
    clearLogo();

    isGenerated = false;
    els.canvas.classList.add("hidden");
    els.emptyState.classList.remove("hidden");
    setDownloadState(false);
    clearMessage();
    els.textContent.focus();
  }

  // ---------- Eventos ----------

  function bindEvents() {
    els.typeButtons.forEach(button => {
      button.addEventListener("click", () => switchType(button.dataset.type));
    });

    els.textContent.addEventListener("input", () => {
      els.charCount.textContent = `${els.textContent.value.length}/2000`;
      clearMessage();
    });

    els.wifiSecurity.addEventListener("change", updateWifiPasswordVisibility);
    document.querySelectorAll("[data-reveal-for]").forEach(button => {
      button.addEventListener("click", () => {
        const target = document.getElementById(button.dataset.revealFor);
        const revealed = target.type === "text";
        target.type = revealed ? "password" : "text";
        button.setAttribute("aria-label", revealed ? "Mostrar contraseña" : "Ocultar contraseña");
        button.classList.toggle("active", !revealed);
      });
    });

    els.phoneKindButtons.forEach(button => {
      button.addEventListener("click", () => {
        phoneKind = button.dataset.phoneKind;
        updatePhoneKindUi();
      });
    });

    els.logoToggle.addEventListener("change", () => {
      const on = els.logoToggle.checked;
      els.logoSection.classList.toggle("hidden", !on);
      els.logoSection.setAttribute("aria-hidden", String(!on));
      if (isGenerated) updateQr(false);
    });

    els.logoInput.addEventListener("change", handleLogo);
    els.removeLogo.addEventListener("click", clearLogo);

    els.logoSize.addEventListener("input", () => {
      els.logoSizeOutput.textContent = `${els.logoSize.value}%`;
      if (isGenerated && els.logoToggle.checked && logoDataUrl) updateQr(false);
    });

    linkColorInputs(els.qrColor, els.qrColorText);
    linkColorInputs(els.backgroundColor, els.backgroundColorText);

    els.bgModeButtons.forEach(button => {
      button.addEventListener("click", () => switchBgMode(button.dataset.bgMode));
    });

    els.bgImageInput.addEventListener("change", handleBgImage);
    els.bgImageOpacity.addEventListener("input", () => {
      els.bgImageOpacityOutput.textContent = `${els.bgImageOpacity.value}%`;
      if (isGenerated && bgMode === "image" && bgImage) updateQr(false);
    });

    els.bgEmojiChars.addEventListener("input", () => {
      regenerateEmojiLayout();
      if (isGenerated && bgMode === "emoji") updateQr(false);
    });
    els.bgEmojiSize.addEventListener("input", () => {
      els.bgEmojiSizeOutput.textContent = `${els.bgEmojiSize.value}px`;
      regenerateEmojiLayout();
      if (isGenerated && bgMode === "emoji") updateQr(false);
    });
    els.bgEmojiOpacity.addEventListener("input", () => {
      els.bgEmojiOpacityOutput.textContent = `${els.bgEmojiOpacity.value}%`;
      if (isGenerated && bgMode === "emoji") updateQr(false);
    });

    els.generateButton.addEventListener("click", () => updateQr(false));
    els.downloadPng.addEventListener("click", () => download("png"));
    els.downloadSvg.addEventListener("click", () => download("svg"));
    els.resetButton.addEventListener("click", resetForm);

    els.clearHistory.addEventListener("click", () => {
      WarriorHistory.clear().then(renderHistory);
    });

    window.addEventListener("online", () => clearMessage());
    window.addEventListener("offline", () => {
      if (!isGenerated) showMessage("Estás sin conexión. La aplicación seguirá disponible si ya fue cargada.", "error");
    });
  }

  function registerServiceWorker() {
    if ("serviceWorker" in navigator && location.protocol !== "file:") {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("./service-worker.js").catch(() => {});
      });
    }
  }
})();
