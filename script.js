(() => {
  "use strict";

  const els = {};
  let qrCode;
  let currentMode = "normal";
  let logoDataUrl = "";
  let isGenerated = false;

  const DEFAULT_TEXT = "https://www.example.com";
  const MAX_LOGO_BYTES = 5 * 1024 * 1024;

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    Object.assign(els, {
      content: document.getElementById("qr-content"),
      charCount: document.getElementById("char-count"),
      modeButtons: [...document.querySelectorAll(".mode-button")],
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
      generateButton: document.getElementById("generate-button"),
      downloadPng: document.getElementById("download-png"),
      downloadSvg: document.getElementById("download-svg"),
      resetButton: document.getElementById("reset-button"),
      canvas: document.getElementById("qr-canvas"),
      emptyState: document.getElementById("empty-state"),
      modeBadge: document.getElementById("mode-badge"),
      message: document.getElementById("message"),
      year: document.getElementById("year")
    });

    els.year.textContent = new Date().getFullYear();
    els.charCount.textContent = `${els.content.value.length}/2000`;

    if (typeof QRCodeStyling === "undefined") {
      showMessage("No se pudo cargar el generador. Revisa tu conexión e inténtalo otra vez.", "error");
      els.generateButton.disabled = true;
      return;
    }

    createQr();
    bindEvents();
    updateQr(true);
    registerServiceWorker();
  }

  function createQr() {
    qrCode = new QRCodeStyling(buildOptions());
    els.canvas.replaceChildren();
    qrCode.append(els.canvas);
    isGenerated = true;
    setDownloadState(true);
  }

  function buildOptions() {
    const size = 1000;
    const withLogo = currentMode === "logo" && Boolean(logoDataUrl);

    return {
      width: size,
      height: size,
      type: "svg",
      data: els.content?.value.trim() || DEFAULT_TEXT,
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
        color: els.backgroundColor?.value || "#ffffff"
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

  function bindEvents() {
    els.modeButtons.forEach(button => {
      button.addEventListener("click", () => switchMode(button.dataset.mode));
    });

    els.content.addEventListener("input", () => {
      els.charCount.textContent = `${els.content.value.length}/2000`;
      clearMessage();
    });

    els.logoInput.addEventListener("change", handleLogo);
    els.removeLogo.addEventListener("click", clearLogo);

    els.logoSize.addEventListener("input", () => {
      els.logoSizeOutput.textContent = `${els.logoSize.value}%`;
      if (isGenerated && currentMode === "logo" && logoDataUrl) updateQr(false);
    });

    linkColorInputs(els.qrColor, els.qrColorText);
    linkColorInputs(els.backgroundColor, els.backgroundColorText);

    els.generateButton.addEventListener("click", () => updateQr(false));
    els.downloadPng.addEventListener("click", () => download("png"));
    els.downloadSvg.addEventListener("click", () => download("svg"));
    els.resetButton.addEventListener("click", resetForm);

    window.addEventListener("online", () => clearMessage());
    window.addEventListener("offline", () => {
      if (!isGenerated) showMessage("Estás sin conexión. La aplicación seguirá disponible si ya fue cargada.", "error");
    });
  }

  function switchMode(mode) {
    currentMode = mode;
    els.modeButtons.forEach(button => {
      const active = button.dataset.mode === mode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });

    const logoMode = mode === "logo";
    els.logoSection.classList.toggle("hidden", !logoMode);
    els.logoSection.setAttribute("aria-hidden", String(!logoMode));
    els.modeBadge.textContent = logoMode ? "Con logo" : "Normal";
    clearMessage();

    if (isGenerated) updateQr(false);
  }

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
      updateQr(false);
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
    clearMessage();
  }

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

  function updateQr(initial) {
    const content = els.content.value.trim();

    if (!content) {
      isGenerated = false;
      els.canvas.classList.add("hidden");
      els.emptyState.classList.remove("hidden");
      setDownloadState(false);
      if (!initial) showMessage("Escribe un texto o enlace para generar el código QR.", "error");
      return;
    }

    if (currentMode === "logo" && !logoDataUrl && !initial) {
      showMessage("Puedes agregar un logo o generar el QR sin imagen central.", "success");
    } else if (!initial) {
      showMessage("Código QR actualizado correctamente.", "success");
    }

    els.emptyState.classList.add("hidden");
    els.canvas.classList.remove("hidden");

    const options = buildOptions();
    if (!qrCode) {
      qrCode = new QRCodeStyling(options);
      qrCode.append(els.canvas);
    } else {
      qrCode.update(options);
    }

    isGenerated = true;
    setDownloadState(true);
  }

  async function download(extension) {
    if (!isGenerated || !qrCode) return;

    try {
      await qrCode.download({
        name: currentMode === "logo" && logoDataUrl ? "BriQR-con-logo" : "BriQR",
        extension
      });
      showMessage(`Tu archivo ${extension.toUpperCase()} se descargó correctamente.`, "success");
    } catch (error) {
      console.error(error);
      showMessage("No se pudo descargar el archivo. Inténtalo nuevamente.", "error");
    }
  }

  function resetForm() {
    els.content.value = "";
    els.charCount.textContent = "0/2000";
    els.qrColor.value = "#111827";
    els.qrColorText.value = "#111827";
    els.backgroundColor.value = "#ffffff";
    els.backgroundColorText.value = "#FFFFFF";
    els.logoSize.value = "22";
    els.logoSizeOutput.textContent = "22%";
    clearLogo();
    switchMode("normal");

    isGenerated = false;
    els.canvas.classList.add("hidden");
    els.emptyState.classList.remove("hidden");
    setDownloadState(false);
    clearMessage();
    els.content.focus();
  }

  function setDownloadState(enabled) {
    els.downloadPng.disabled = !enabled;
    els.downloadSvg.disabled = !enabled;
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

  function registerServiceWorker() {
    if ("serviceWorker" in navigator && location.protocol !== "file:") {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("./service-worker.js").catch(() => {});
      });
    }
  }
})();